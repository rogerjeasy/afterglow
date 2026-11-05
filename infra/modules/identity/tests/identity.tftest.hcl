# Account-security properties of the user pool and its app client.

mock_provider "aws" {
  mock_data "aws_region" {
    defaults = {
      name   = "eu-central-1"
      region = "eu-central-1"
    }
  }
}

variables {
  name                      = "afterglow-test-accounts"
  webauthn_relying_party_id = "afterglow-flax.vercel.app"
}

run "passkeys_are_available_and_require_user_verification" {
  command = plan

  assert {
    condition     = contains(one(aws_cognito_user_pool.this.sign_in_policy).allowed_first_auth_factors, "WEB_AUTHN")
    error_message = "Passkeys must be an allowed first factor."
  }

  assert {
    condition     = one(aws_cognito_user_pool.this.web_authn_configuration).user_verification == "required"
    error_message = "Passkeys must require user verification (biometric or PIN)."
  }

  assert {
    condition     = one(aws_cognito_user_pool.this.web_authn_configuration).relying_party_id == "afterglow-flax.vercel.app"
    error_message = "Passkeys must be bound to the app domain."
  }
}

run "pool_requires_the_tier_that_supports_passkeys" {
  command = plan

  assert {
    condition     = aws_cognito_user_pool.this.user_pool_tier == "ESSENTIALS"
    error_message = "Choice-based sign-in with passkeys needs the Essentials tier."
  }
}

run "email_otp_needs_ses_and_is_off_without_it" {
  command = plan

  variables {
    enable_email_otp = true
  }

  assert {
    condition     = !contains(one(aws_cognito_user_pool.this.sign_in_policy).allowed_first_auth_factors, "EMAIL_OTP")
    error_message = "Email codes must not be enabled unless SES is configured."
  }
}

run "email_otp_is_allowed_once_ses_is_configured" {
  command = plan

  variables {
    enable_email_otp = true
    ses_source_arn   = "arn:aws:ses:eu-central-1:123456789012:identity/afterglow.example"
    ses_from_address = "no-reply@afterglow.example"
  }

  assert {
    condition     = contains(one(aws_cognito_user_pool.this.sign_in_policy).allowed_first_auth_factors, "EMAIL_OTP")
    error_message = "Email codes should be allowed with SES."
  }
}

run "the_client_cannot_send_a_plaintext_password" {
  command = plan

  assert {
    condition     = !contains(aws_cognito_user_pool_client.app.explicit_auth_flows, "ALLOW_USER_PASSWORD_AUTH")
    error_message = "ALLOW_USER_PASSWORD_AUTH sends the password itself; only SRP may be used."
  }

  assert {
    condition     = contains(aws_cognito_user_pool_client.app.explicit_auth_flows, "ALLOW_USER_SRP_AUTH")
    error_message = "SRP must be available."
  }
}

run "a_browser_client_has_no_secret_and_no_oauth_redirects" {
  command = plan

  assert {
    condition     = aws_cognito_user_pool_client.app.generate_secret == false
    error_message = "A browser app cannot keep a secret."
  }

  assert {
    condition     = aws_cognito_user_pool_client.app.allowed_oauth_flows_user_pool_client == false
    error_message = "No hosted UI or OAuth redirects: the app talks to Cognito directly."
  }
}

run "tokens_are_short_lived_and_revocable_and_rotate" {
  command = plan

  assert {
    condition = (
      aws_cognito_user_pool_client.app.access_token_validity <= 15 &&
      aws_cognito_user_pool_client.app.id_token_validity <= 15
    )
    error_message = "Access and ID tokens must live 15 minutes or less."
  }

  assert {
    condition     = aws_cognito_user_pool_client.app.enable_token_revocation == true
    error_message = "Refresh tokens must be revocable."
  }

  assert {
    condition     = one(aws_cognito_user_pool_client.app.refresh_token_rotation).feature == "ENABLED"
    error_message = "Refresh tokens must rotate on use."
  }
}

run "no_account_enumeration" {
  command = plan

  assert {
    condition     = aws_cognito_user_pool_client.app.prevent_user_existence_errors == "ENABLED"
    error_message = "Sign-in errors must not reveal whether an account exists."
  }
}

run "client_can_only_write_the_email_attribute" {
  command = plan

  assert {
    condition     = toset(aws_cognito_user_pool_client.app.write_attributes) == toset(["email"])
    error_message = "The client must not be able to write other attributes."
  }
}

run "pool_is_protected_by_default_and_can_be_unprotected_for_dev" {
  command = plan

  assert {
    condition     = aws_cognito_user_pool.this.deletion_protection == "ACTIVE"
    error_message = "Deleting the pool deletes every account; protection must default to on."
  }
}

run "dev_may_turn_protection_off" {
  command = plan

  variables {
    deletion_protection = false
  }

  assert {
    condition     = aws_cognito_user_pool.this.deletion_protection == "INACTIVE"
    error_message = "The flag must be honoured."
  }
}

run "a_url_is_not_a_relying_party_id" {
  command = plan

  variables {
    webauthn_relying_party_id = "https://afterglow-flax.vercel.app/"
  }

  expect_failures = [var.webauthn_relying_party_id]
}
