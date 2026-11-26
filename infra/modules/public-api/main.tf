# The public, anonymous API (.kiro/specs/crowd-reports): signed crowd reports in,
# k-anonymous cells out, and privacy-preserving proxies for public places and the
# weather. No route needs an account; abuse is limited by daily device keys, signed
# reports, one report per device, cell and minute, and API throttling.

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  routes = [
    "POST /v1/devices",
    "POST /v1/reports",
    "POST /v1/push/subscribe",
    "POST /v1/push/unsubscribe",
    "POST /v1/voice/ussd",
    "POST /v1/voice/sms",
    "GET /v1/cells",
    "GET /v1/places",
    "GET /v1/weather",
    "GET /v1/health",
  ]
}

data "archive_file" "bundle" {
  type        = "zip"
  source_file = var.bundle_path
  output_path = "${path.module}/.build/crowd.zip"
}

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
  # checkov:skip=CKV_AWS_158:Default CloudWatch Logs encryption; the logs hold route, status and duration only.
  # checkov:skip=CKV_AWS_338:Thirty days is the retention promise for operational logs.
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
    sid       = "ReportsPutAndQuery"
    actions   = ["dynamodb:PutItem", "dynamodb:Query"]
    resources = [var.reports_table_arn]
  }

  statement {
    sid       = "DeviceKeysAndCache"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem"]
    resources = [var.device_table_arn, var.cache_table_arn]
  }

  statement {
    sid       = "PushSubscriptions"
    actions   = ["dynamodb:Query", "dynamodb:PutItem", "dynamodb:DeleteItem"]
    resources = [var.push_table_arn]
  }

  # The VAPID signing key, read at run time. It is a SecureString under the AWS
  # managed key for Parameter Store, so no KMS grant is needed here.
  statement {
    sid       = "ReadVapidKey"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:${data.aws_partition.current.partition}:ssm:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:parameter${var.vapid_param_name}"]
  }

  # Public places can take a minute to fetch, so the function hands that work to a
  # background run of itself. It may invoke this one function and nothing else.
  statement {
    sid       = "InvokeOnlyItselfInTheBackground"
    actions   = ["lambda:InvokeFunction"]
    resources = ["arn:${data.aws_partition.current.partition}:lambda:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:function:${var.name}"]
  }

  statement {
    sid       = "TablesKeyThroughDynamoDBOnly"
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

resource "aws_lambda_function" "public" {
  # checkov:skip=CKV_AWS_116:Only called synchronously by API Gateway; a dead-letter queue does not apply.
  # checkov:skip=CKV_AWS_117:No VPC: it calls DynamoDB and two public APIs; a VPC would add NAT cost and no isolation IAM does not give.
  # checkov:skip=CKV_AWS_173:The environment holds table names only, no secret.
  # checkov:skip=CKV_AWS_272:Code signing needs a signing profile; the bundle is built and deployed from this repository.
  # checkov:skip=CKV_AWS_115:Reserved concurrency is left unset for low-quota accounts; API Gateway throttling is the brake.
  function_name    = var.name
  role             = aws_iam_role.fn.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.bundle.output_path
  source_code_hash = data.archive_file.bundle.output_base64sha256
  memory_size      = 512
  # API Gateway still stops synchronous calls at 29 s; the extra time is for the
  # background places fetch from OpenStreetMap's public server.
  timeout = 90

  environment {
    variables = {
      REPORTS_TABLE = var.reports_table_name
      DEVICE_TABLE  = var.device_table_name
      CACHE_TABLE   = var.cache_table_name
      PUSH_TABLE    = var.push_table_name
      VAPID_PARAM   = var.vapid_param_name
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  depends_on = [aws_cloudwatch_log_group.fn, aws_iam_role_policy.fn]
}

resource "aws_apigatewayv2_api" "this" {
  name          = var.name
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.web_origins
    allow_methods = ["GET", "POST"]
    allow_headers = ["content-type"]
    max_age       = 600
  }
}

resource "aws_apigatewayv2_integration" "public" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.public.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 29000
}

resource "aws_apigatewayv2_route" "public" {
  # checkov:skip=CKV_AWS_309:Anonymous by design (no accounts for safety functions, ACC-01); reports are signed with daily device keys instead.
  for_each = toset(local.routes)

  api_id    = aws_apigatewayv2_api.this.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.public.id}"
}

resource "aws_cloudwatch_log_group" "access" {
  # checkov:skip=CKV_AWS_158:Default encryption; access logs carry no identity.
  # checkov:skip=CKV_AWS_338:Thirty days.
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

  # No source IP, no user agent, no query string (it holds a cell).
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId = "$context.requestId"
      time      = "$context.requestTimeEpoch"
      route     = "$context.routeKey"
      status    = "$context.status"
      latency   = "$context.responseLatency"
    })
  }
}

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.public.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*/v1/*"
}
