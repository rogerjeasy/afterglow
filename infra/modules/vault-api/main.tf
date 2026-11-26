# The vault API (.kiro/specs/cloud-accounts, CA-01..CA-08).
#
# API Gateway checks every request's Cognito access token before any code runs
# (CA-07). The function takes the account id only from the verified `sub`
# (CA-01), may touch only the vault table (CA-08), and stores ciphertext only
# (CA-03). Nothing here is public without a valid token.

data "aws_region" "current" {}

locals {
  # POST /v1/vault/revoke: after a passphrase change, refuse every older token (CA-13).
  routes = ["GET /v1/vault", "PUT /v1/vault", "DELETE /v1/vault", "POST /v1/vault/revoke"]
}

data "archive_file" "bundle" {
  type        = "zip"
  source_file = var.bundle_path
  output_path = "${path.module}/.build/vault.zip"
}

# ------------------------------------------------------------------ function

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "fn" {
  name               = "${var.name}-fn"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_cloudwatch_log_group" "fn" {
  # checkov:skip=CKV_AWS_158:CloudWatch Logs encrypts at rest by default; the regional key's policy does not grant the logs service, and the logs hold no data (route, status, duration only).
  # checkov:skip=CKV_AWS_338:Thirty days is the retention promise for operational logs (privacy-aggregation.md).
  name              = "/aws/lambda/${var.name}"
  retention_in_days = var.log_retention_days
}

data "aws_iam_policy_document" "fn" {
  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.fn.arn}:*"]
  }

  statement {
    sid       = "VaultItemsOnly"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"]
    resources = [var.table_arn]
  }

  statement {
    sid       = "TableKeyThroughDynamoDBOnly"
    actions   = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
    resources = [var.kms_key_arn]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["dynamodb.${data.aws_region.current.region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "fn" {
  name   = "${var.name}-fn"
  role   = aws_iam_role.fn.id
  policy = data.aws_iam_policy_document.fn.json
}

resource "aws_lambda_function" "vault" {
  # checkov:skip=CKV_AWS_116:A dead-letter queue applies to asynchronous invocations; this function is only called synchronously by API Gateway.
  # checkov:skip=CKV_AWS_117:No VPC: the function reaches DynamoDB over AWS's network; a VPC would add NAT cost and no isolation the IAM policy does not already give.
  # checkov:skip=CKV_AWS_173:The environment holds a table name and a public client id, no secret.
  # checkov:skip=CKV_AWS_272:Code signing needs a signing profile; the bundle is built and deployed from this repository by Terraform.
  # checkov:skip=CKV_AWS_115:Reserved concurrency is left unset so a new account with a low concurrency quota can deploy; API Gateway throttling is the brake.
  function_name    = var.name
  role             = aws_iam_role.fn.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.bundle.output_path
  source_code_hash = data.archive_file.bundle.output_base64sha256
  memory_size      = 256
  timeout          = 5

  environment {
    variables = {
      TABLE_NAME = var.table_name
      CLIENT_ID  = var.client_id
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  depends_on = [aws_cloudwatch_log_group.fn, aws_iam_role_policy.fn]
}

# ----------------------------------------------------------------------- API

resource "aws_apigatewayv2_api" "this" {
  name          = var.name
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.web_origins
    allow_methods = ["GET", "PUT", "DELETE", "POST"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 600
  }
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.this.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer   = var.issuer
    audience = [var.client_id]
  }
}

resource "aws_apigatewayv2_integration" "vault" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.vault.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "vault" {
  for_each = toset(local.routes)

  api_id             = aws_apigatewayv2_api.this.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.vault.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_cloudwatch_log_group" "access" {
  # checkov:skip=CKV_AWS_158:Default CloudWatch Logs encryption; access logs carry no identity (see format below).
  # checkov:skip=CKV_AWS_338:Thirty days, as above.
  name              = "/aws/apigateway/${var.name}"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = var.throttle_rate
    throttling_burst_limit = var.throttle_burst
  }

  # No source IP, no user agent, no account id: who called is not logged.
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId = "$context.requestId"
      time      = "$context.requestTimeEpoch"
      route     = "$context.routeKey"
      status    = "$context.status"
      latency   = "$context.responseLatency"
      authError = "$context.authorizer.error"
    })
  }
}

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.vault.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*/v1/vault*"
}
