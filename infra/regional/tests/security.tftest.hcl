# Security and privacy properties of one regional stack, checked on the plan
# with a mocked AWS provider: no credentials, no AWS calls, nothing is created.
#
#   cd infra/regional && terraform init -backend=false && terraform test
#
# Each run block names the promise it protects.

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
      arn        = "arn:aws:iam::123456789012:user/test"
      user_id    = "AIDATEST"
    }
  }

  mock_data "aws_partition" {
    defaults = {
      partition = "aws"
    }
  }

  mock_data "aws_region" {
    defaults = {
      name   = "eu-central-1"
      region = "eu-central-1"
    }
  }

  # The mock returns random strings for policy documents unless told otherwise.
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  # Mock ARNs must look like ARNs where a resource validates them.
  mock_resource "aws_kms_key" {
    defaults = {
      arn = "arn:aws:kms:eu-central-1:123456789012:key/11111111-2222-3333-4444-555555555555"
    }
  }

  mock_resource "aws_cloudfront_distribution" {
    defaults = {
      arn = "arn:aws:cloudfront::123456789012:distribution/EDFDVBD6EXAMPLE"
    }
  }

  mock_resource "aws_sns_topic" {
    defaults = {
      arn = "arn:aws:sns:eu-central-1:123456789012:afterglow-test-alerts"
    }
  }
}

variables {
  aws_account_id            = "123456789012"
  environment               = "dev"
  region                    = "eu-central-1"
  web_origins               = ["https://afterglow-flax.vercel.app"]
  webauthn_relying_party_id = "afterglow-flax.vercel.app"
  alert_emails              = []
}

run "retention_is_enforced_with_ttl_and_no_backups_where_promised" {
  command = plan

  # privacy-aggregation.md rule 7: raw windows 30 d, roster relay 7 d, devices 30 d.
  assert {
    condition = (
      local.retention.raw_cell_windows_days == 30 &&
      local.retention.roster_relay_days == 7 &&
      local.retention.device_days == 30 &&
      local.retention.cell_history_days >= 1826
    )
    error_message = "Retention constants drifted from the privacy spec."
  }

  assert {
    condition = (
      local.tables.cell_state.ttl_attribute == "expiresAt" &&
      local.tables.roster_relay.ttl_attribute == "expiresAt" &&
      local.tables.device.ttl_attribute == "expiresAt" &&
      local.tables.schedule.ttl_attribute == "expiresAt"
    )
    error_message = "Short-retention tables must expire items with a TTL."
  }

  # A point-in-time backup would keep expired items for up to 35 days, breaking the promise.
  assert {
    condition = (
      local.tables.cell_state.pitr == false &&
      local.tables.roster_relay.pitr == false &&
      local.tables.device.pitr == false
    )
    error_message = "Tables with a short retention promise must not have point-in-time recovery."
  }

  # Data that cannot be recreated is backed up.
  assert {
    condition     = local.tables.formulary.pitr == true && local.tables.vault.pitr == true
    error_message = "The formulary and the account vault must be backed up."
  }
}

run "no_table_stores_anything_but_what_the_spec_names" {
  command = plan

  assert {
    condition     = toset(keys(local.tables)) == toset(["cell_state", "schedule", "adherence", "device", "roster_relay", "formulary", "vault"])
    error_message = "A new table needs a spec entry and a privacy review first."
  }
}

run "tables_are_protected_by_default" {
  command = plan

  assert {
    condition     = var.protect_resources == true
    error_message = "Deletion protection must default to on."
  }
}

run "dev_can_opt_out_of_deletion_protection_for_iteration" {
  command = plan

  variables {
    protect_resources = false
  }

  assert {
    condition     = var.protect_resources == false
    error_message = "Dev must be able to turn protection off explicitly."
  }
}

run "wildcard_or_plain_http_web_origins_are_rejected" {
  command = plan

  variables {
    web_origins = ["*"]
  }

  expect_failures = [var.web_origins]
}

run "http_origins_are_rejected" {
  command = plan

  variables {
    web_origins = ["http://insecure.example"]
  }

  expect_failures = [var.web_origins]
}

run "only_the_five_afterglow_regions_are_allowed" {
  command = plan

  variables {
    region = "us-west-2"
  }

  expect_failures = [var.region]
}

run "account_id_must_be_twelve_digits" {
  command = plan

  variables {
    aws_account_id = "1234"
  }

  expect_failures = [var.aws_account_id]
}

run "passkey_domain_must_be_a_bare_domain" {
  command = plan

  variables {
    webauthn_relying_party_id = "https://afterglow-flax.vercel.app/"
  }

  expect_failures = [var.webauthn_relying_party_id]
}
