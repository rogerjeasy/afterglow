# The consoles' API (.kiro/specs/consoles). API Gateway checks every request's
# Cognito access token before any code runs; the function takes identity only from
# the verified claims: the `sub` owns business data, and the `beacon` group (granted
# only by an administrator) may publish advisories.

data "aws_region" "current" {}

locals {
  routes = [
    "GET /v1/console/me",
    "GET /v1/console/sites",
    "PUT /v1/console/sites/{siteId}",
    "DELETE /v1/console/sites/{siteId}",
    "POST /v1/console/sites/{siteId}/status",
    "POST /v1/console/sites/{siteId}/log",
    "GET /v1/console/sites/{siteId}/log",
    "POST /v1/console/advisories",
  ]
}

data "archive_file" "bundle" {
  type        = "zip"
  source_file = var.bundle_path
  output_path = "${path.module}/.build/console.zip"
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
    sid       = "BusinessItems"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:Query"]
    resources = [var.business_table_arn]
  }

  statement {
    sid       = "PublishSiteStatus"
    actions   = ["dynamodb:PutItem", "dynamodb:DeleteItem"]
    resources = [var.sites_table_arn]
  }

  statement {
    sid       = "PublishAdvisories"
    actions   = ["dynamodb:PutItem"]
    resources = [var.advisories_table_arn]
  }

  # Advisories are pushed by the public function's notify run; this may invoke it only.
  statement {
    sid       = "PushThroughPublicFunction"
    actions   = ["lambda:InvokeFunction"]
    resources = [var.public_function_arn]
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

resource "aws_lambda_function" "console" {
  # checkov:skip=CKV_AWS_116:A dead-letter queue applies to asynchronous invocations; this function is only called synchronously by API Gateway.
  # checkov:skip=CKV_AWS_117:No VPC: the function reaches DynamoDB over AWS's network; a VPC would add NAT cost and no isolation the IAM policy does not already give.
  # checkov:skip=CKV_AWS_173:The environment holds table names and a function ARN, no secret.
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
      BUSINESS_TABLE   = var.business_table_name
      SITES_TABLE      = var.sites_table_name
      ADVISORIES_TABLE = var.advisories_table_name
      PUBLIC_FUNCTION  = var.public_function_arn
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

resource "aws_apigatewayv2_integration" "console" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.console.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "console" {
  for_each = toset(local.routes)

  api_id             = aws_apigatewayv2_api.this.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.console.id}"
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
  function_name = aws_lambda_function.console.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*/v1/console/*"
}
