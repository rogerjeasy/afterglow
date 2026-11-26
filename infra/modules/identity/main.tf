# Optional accounts (ADR-006). A regional Cognito user pool with passkeys.
#
# IMPORTANT: Cognito authenticates the account. It never holds, sees or can
# derive the vault passphrase that encrypts a person's data (ACC-04, ACC-18).
# The account password (if one is used at all) and the vault passphrase must be
# different secrets; passkeys avoid the question. See infra/README.md.

locals {
  use_ses = var.ses_source_arn != null

  # Email codes as a first factor need Amazon SES; passkeys and passwords do not.
  first_factors = concat(
    ["PASSWORD", "WEB_AUTHN"],
    var.enable_email_otp && local.use_ses ? ["EMAIL_OTP"] : [],
  )
}

resource "aws_cognito_user_pool" "this" {
  # checkov:skip=CKV_AWS_363:Advanced security features need the Plus tier (a per-MAU charge); revisit when accounts have real users.
  name                = var.name
  user_pool_tier      = "ESSENTIALS"
  deletion_protection = var.deletion_protection ? "ACTIVE" : "INACTIVE"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OPTIONAL"

  username_configuration {
    case_sensitive = false
  }

  # Length over composition rules. This is the account password, not the vault passphrase.
  password_policy {
    minimum_length                   = 12
    require_lowercase                = false
    require_uppercase                = false
    require_numbers                  = false
    require_symbols                  = false
    temporary_password_validity_days = 3
    password_history_size            = 0
  }

  sign_in_policy {
    allowed_first_auth_factors = local.first_factors
  }

  web_authn_configuration {
    relying_party_id  = var.webauthn_relying_party_id
    user_verification = "required"
  }

  software_token_mfa_configuration {
    enabled = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  admin_create_user_config {
    allow_admin_create_user_only = !var.allow_self_signup
  }

  email_configuration {
    email_sending_account = local.use_ses ? "DEVELOPER" : "COGNITO_DEFAULT"
    source_arn            = local.use_ses ? var.ses_source_arn : null
    from_email_address    = local.use_ses ? var.ses_from_address : null
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 5
      max_length = 254
    }
  }

  lifecycle {
    # The schema cannot be changed in place after creation; a change would
    # force a replacement of the pool and lose every account.
    ignore_changes = [schema]
  }
}

resource "aws_cognito_user_pool_client" "app" {
  name         = "${var.name}-web"
  user_pool_id = aws_cognito_user_pool.this.id

  # A browser app cannot keep a secret.
  generate_secret = false

  # SRP and the choice-based flow only. ALLOW_USER_PASSWORD_AUTH is left out
  # on purpose: it sends the password itself to Cognito instead of a proof.
  explicit_auth_flows = [
    "ALLOW_USER_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  # Short-lived tokens; a stolen access token is useful for minutes, not days.
  access_token_validity  = 15
  id_token_validity      = 15
  refresh_token_validity = var.refresh_token_days
  auth_session_validity  = 3

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  # No refresh-token rotation. Cognito refuses rotation together with
  # ALLOW_REFRESH_TOKEN_AUTH (found on first apply), and the app's SRP client refreshes
  # through that flow. Rotation mainly protects refresh tokens kept at rest; the app keeps
  # tokens in memory only and never stores them, and revocation stays on, so a global
  # sign-out after a passphrase change still ends every session.

  # No hosted UI and no OAuth redirects: the app talks to Cognito directly.
  allowed_oauth_flows_user_pool_client = false

  read_attributes  = ["email", "email_verified"]
  write_attributes = ["email"]
}
