# Edge and least-privilege properties of the vault API (cloud-accounts CA-07, CA-08).

mock_provider "aws" {
  mock_data "aws_region" {
    defaults = {
      name   = "eu-central-1"
      region = "eu-central-1"
    }
  }
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
  mock_resource "aws_apigatewayv2_api" {
    defaults = {
      execution_arn = "arn:aws:execute-api:eu-central-1:123456789012:abc123"
      api_endpoint  = "https://abc123.execute-api.eu-central-1.amazonaws.com"
    }
  }
  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/afterglow-test-vault-fn"
    }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:eu-central-1:123456789012:log-group:/aws/lambda/afterglow-test-vault"
    }
  }
}

mock_provider "archive" {}

variables {
  name        = "afterglow-test-vault"
  table_name  = "afterglow-test-vault"
  table_arn   = "arn:aws:dynamodb:eu-central-1:123456789012:table/afterglow-test-vault"
  kms_key_arn = "arn:aws:kms:eu-central-1:123456789012:key/11111111-2222-3333-4444-555555555555"
  issuer      = "https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_TEST"
  client_id   = "testclientid"
  web_origins = ["https://afterglow-flax.vercel.app"]
  bundle_path = "tests/fixture/index.mjs"
}

run "every_route_requires_a_cognito_token" {
  command = plan

  assert {
    condition     = length(aws_apigatewayv2_route.vault) == 4
    error_message = "Exactly the four vault routes exist."
  }

  assert {
    condition     = alltrue([for r in aws_apigatewayv2_route.vault : r.authorization_type == "JWT"])
    error_message = "CA-07: every route must use the JWT authorizer; no route may be open."
  }

  assert {
    condition     = toset([for r in aws_apigatewayv2_route.vault : r.route_key]) == toset(["GET /v1/vault", "PUT /v1/vault", "DELETE /v1/vault", "POST /v1/vault/revoke"])
    error_message = "Routes must be exactly GET, PUT and DELETE /v1/vault and POST /v1/vault/revoke: none takes an account id."
  }

  assert {
    condition     = alltrue([for r in aws_apigatewayv2_route.vault : !strcontains(r.route_key, "{")])
    error_message = "CA-01: no route may carry a path parameter that could name an account."
  }
}

run "the_authorizer_trusts_only_this_pool_and_client" {
  command = plan

  assert {
    condition     = aws_apigatewayv2_authorizer.jwt.authorizer_type == "JWT"
    error_message = "The authorizer must verify JWTs."
  }

  assert {
    condition     = one(aws_apigatewayv2_authorizer.jwt.jwt_configuration).issuer == "https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_TEST"
    error_message = "The authorizer must trust exactly this user pool."
  }

  assert {
    condition     = one(aws_apigatewayv2_authorizer.jwt.jwt_configuration).audience == toset(["testclientid"])
    error_message = "The authorizer must accept tokens for exactly this app client."
  }

  assert {
    condition     = aws_apigatewayv2_authorizer.jwt.identity_sources == toset(["$request.header.Authorization"])
    error_message = "The token must come from the Authorization header."
  }
}

run "cors_allows_only_the_app" {
  command = plan

  assert {
    condition     = one(aws_apigatewayv2_api.this.cors_configuration).allow_origins == toset(["https://afterglow-flax.vercel.app"])
    error_message = "CA-07: only the app's own origin may call the API from a browser."
  }

  assert {
    condition     = !contains(tolist(one(aws_apigatewayv2_api.this.cors_configuration).allow_origins), "*")
    error_message = "No wildcard origin."
  }
}

run "a_wildcard_origin_is_refused" {
  command = plan

  variables {
    web_origins = ["*"]
  }

  expect_failures = [var.web_origins]
}

run "the_function_may_touch_only_vault_items" {
  # Some ARNs are known only after apply; the mock provider applies offline.
  command = apply

  assert {
    condition = toset(flatten([
      for s in data.aws_iam_policy_document.fn.statement : s.actions if s.sid == "VaultItemsOnly"
    ])) == toset(["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"])
    error_message = "CA-08: item reads, writes and deletes only; no Scan, Query or table actions."
  }

  assert {
    condition = toset(flatten([
      for s in data.aws_iam_policy_document.fn.statement : s.resources if s.sid == "VaultItemsOnly"
    ])) == toset(["arn:aws:dynamodb:eu-central-1:123456789012:table/afterglow-test-vault"])
    error_message = "CA-08: the vault table only."
  }

  assert {
    condition = alltrue(flatten([
      for s in data.aws_iam_policy_document.fn.statement : [for a in s.actions : !strcontains(a, "*")]
    ]))
    error_message = "CA-08: no wildcard actions."
  }

  assert {
    condition = alltrue(flatten([
      for s in data.aws_iam_policy_document.fn.statement : [for r in s.resources : r != "*"]
    ]))
    error_message = "CA-08: no wildcard resources."
  }
}

run "the_function_is_current_and_short_lived" {
  # Some ARNs are known only after apply; the mock provider applies offline.
  command = apply

  assert {
    condition     = aws_lambda_function.vault.runtime == "nodejs24.x"
    error_message = "The function runs on Node.js 24 (architecture: Node 24 Lambdas)."
  }

  assert {
    condition     = aws_lambda_function.vault.timeout <= 10
    error_message = "A vault call is one item read or write; a long timeout only hides trouble."
  }

  assert {
    condition     = aws_cloudwatch_log_group.fn.retention_in_days == 30 && aws_cloudwatch_log_group.access.retention_in_days == 30
    error_message = "CA-08: logs are kept 30 days."
  }

  assert {
    condition     = !strcontains(aws_apigatewayv2_stage.default.access_log_settings[0].format, "sourceIp") && !strcontains(aws_apigatewayv2_stage.default.access_log_settings[0].format, "claims")
    error_message = "CA-03: access logs carry no IP address and no identity."
  }
}
