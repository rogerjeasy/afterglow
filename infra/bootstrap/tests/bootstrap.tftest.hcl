# Account-foundation properties, checked on the plan with a mocked provider.

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

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_kms_key" {
    defaults = {
      arn = "arn:aws:kms:eu-central-1:123456789012:key/11111111-2222-3333-4444-555555555555"
    }
  }

  mock_resource "aws_iam_openid_connect_provider" {
    defaults = {
      arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    }
  }
}

variables {
  aws_account_id = "123456789012"
  alert_emails   = ["ops@example.com"]
}

run "the_audit_trail_covers_every_region_and_detects_tampering" {
  command = plan

  assert {
    condition     = aws_cloudtrail.audit.is_multi_region_trail == true
    error_message = "The trail must cover all regions."
  }

  assert {
    condition     = aws_cloudtrail.audit.enable_log_file_validation == true
    error_message = "Log file validation makes tampering detectable."
  }

  assert {
    condition     = aws_cloudtrail.audit.include_global_service_events == true
    error_message = "IAM and other global events must be logged."
  }
}

run "the_account_blocks_public_buckets_whatever_a_stack_does" {
  command = plan

  assert {
    condition = (
      aws_s3_account_public_access_block.this.block_public_acls &&
      aws_s3_account_public_access_block.this.block_public_policy &&
      aws_s3_account_public_access_block.this.ignore_public_acls &&
      aws_s3_account_public_access_block.this.restrict_public_buckets
    )
    error_message = "The account-level public-access block must be fully on."
  }
}

run "someone_is_told_when_spend_runs_away" {
  command = plan

  assert {
    condition     = length(aws_budgets_budget.monthly.notification) == 4
    error_message = "Alerts at 50, 80, 100 percent of actual and 100 percent of forecast."
  }

  assert {
    condition = alltrue([
      for n in aws_budgets_budget.monthly.notification :
      toset(n.subscriber_email_addresses) == toset(["ops@example.com"])
    ])
    error_message = "Every notification must reach the configured addresses."
  }
}

run "a_budget_without_recipients_is_rejected" {
  command = plan

  variables {
    alert_emails = []
  }

  expect_failures = [var.alert_emails]
}

run "nothing_trusts_github_unless_asked" {
  command = plan

  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 0 && length(aws_iam_role.ci_plan) == 0
    error_message = "No OIDC provider or CI role by default."
  }

  assert {
    condition     = output.ci_plan_role_arn == null
    error_message = "There is no CI role to report."
  }
}

run "the_ci_role_is_read_only_and_has_no_attached_admin_policy" {
  command = plan

  variables {
    enable_github_ci = true
  }

  assert {
    condition = (
      aws_iam_role_policy_attachment.ci_view_only[0].policy_arn == "arn:aws:iam::aws:policy/job-function/ViewOnlyAccess" &&
      aws_iam_role_policy_attachment.ci_security_audit[0].policy_arn == "arn:aws:iam::aws:policy/SecurityAudit"
    )
    error_message = "The plan role may only use view-only and security-audit policies."
  }

  assert {
    condition     = aws_iam_role.ci_plan[0].max_session_duration == 3600
    error_message = "CI sessions must be limited to an hour."
  }
}

run "the_ci_role_is_not_assumable_from_anywhere_but_this_repository" {
  command = plan

  variables {
    enable_github_ci  = true
    github_repository = "rogerjeasy/afterglow"
  }

  # The audience must be AWS STS, so a token minted for another service is useless.
  assert {
    condition     = local.ci_trust_conditions.StringEquals["token.actions.githubusercontent.com:aud"] == "sts.amazonaws.com"
    error_message = "The token audience must be sts.amazonaws.com."
  }

  # The subject names this repository's pull requests and main branch, exactly.
  assert {
    condition = toset(local.ci_trust_conditions.StringLike["token.actions.githubusercontent.com:sub"]) == toset([
      "repo:rogerjeasy/afterglow:pull_request",
      "repo:rogerjeasy/afterglow:ref:refs/heads/main",
    ])
    error_message = "Only this repository's pull requests and main branch may assume the role."
  }

  # No wildcard may widen the subject to other repositories, forks or branches.
  assert {
    condition = alltrue([
      for s in local.ci_trust_conditions.StringLike["token.actions.githubusercontent.com:sub"] :
      startswith(s, "repo:rogerjeasy/afterglow:") && !strcontains(s, "*")
    ])
    error_message = "Trust subjects must be exact, with no wildcard."
  }

  # Only the one federated action, and only from the GitHub OIDC provider.
  assert {
    condition     = local.ci_trust_action == "sts:AssumeRoleWithWebIdentity"
    error_message = "The trust policy must allow exactly the federated action."
  }
}

run "a_malformed_repository_name_is_rejected" {
  command = plan

  variables {
    enable_github_ci  = true
    github_repository = "not a repo"
  }

  expect_failures = [var.github_repository]
}

run "guardduty_is_opt_in" {
  command = plan

  assert {
    condition     = length(aws_guardduty_detector.this) == 0
    error_message = "GuardDuty bills by usage; it must be opt-in."
  }
}

run "account_id_must_be_twelve_digits" {
  command = plan

  variables {
    aws_account_id = "abc"
  }

  expect_failures = [var.aws_account_id]
}
