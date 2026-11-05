# Account-wide foundations. Applied once, by a person, before any regional stack.
#
#   - Terraform remote state: a private, versioned, KMS-encrypted S3 bucket
#   - an audit trail (CloudTrail) with tamper-evident log files
#   - the account-level S3 public-access block
#   - IAM Access Analyzer (free): flags resources shared outside the account
#   - a monthly spend budget with email alerts
#   - optionally: GuardDuty, and a READ-ONLY GitHub role that can run `plan`
#
# There is deliberately no role that can `apply`. Deploying is a human step
# (AGENTS.md; architecture ADR-016).

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  account_id  = data.aws_caller_identity.current.account_id
  partition   = data.aws_partition.current.partition
  trail_name  = "afterglow-audit"
  trail_arn   = "arn:${local.partition}:cloudtrail:${var.region}:${local.account_id}:trail/${local.trail_name}"
  state_name  = "afterglow-tfstate-${local.account_id}"
  audit_name  = "afterglow-audit-${local.account_id}"
  github_repo = var.github_repository
}

# ----------------------------------------------------------------------- KMS

module "kms" {
  source = "../modules/kms"

  alias       = "afterglow-account"
  description = "Afterglow account foundations: Terraform state and the audit trail"

  extra_statements = [
    {
      Sid       = "AllowCloudTrailToEncryptItsLogs"
      Effect    = "Allow"
      Principal = { Service = "cloudtrail.amazonaws.com" }
      Action    = "kms:GenerateDataKey*"
      Resource  = "*"
      Condition = {
        StringEquals = { "aws:SourceArn" = local.trail_arn }
        StringLike   = { "kms:EncryptionContext:aws:cloudtrail:arn" = "arn:${local.partition}:cloudtrail:*:${local.account_id}:trail/*" }
      }
    },
    {
      Sid       = "AllowCloudTrailToDescribeTheKey"
      Effect    = "Allow"
      Principal = { Service = "cloudtrail.amazonaws.com" }
      Action    = "kms:DescribeKey"
      Resource  = "*"
      Condition = { StringEquals = { "aws:SourceArn" = local.trail_arn } }
    },
  ]
}

# ----------------------------------------------------------- Terraform state

module "state_bucket" {
  source = "../modules/s3-bucket"

  name                    = local.state_name
  kms_key_arn             = module.kms.key_arn
  versioning              = true
  noncurrent_version_days = 90
}

# --------------------------------------------------------------- Audit trail

data "aws_iam_policy_document" "audit_bucket" {
  statement {
    sid       = "AWSCloudTrailAclCheck"
    effect    = "Allow"
    actions   = ["s3:GetBucketAcl"]
    resources = ["arn:${local.partition}:s3:::${local.audit_name}"]

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [local.trail_arn]
    }
  }

  statement {
    sid       = "AWSCloudTrailWrite"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["arn:${local.partition}:s3:::${local.audit_name}/AWSLogs/${local.account_id}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [local.trail_arn]
    }
  }
}

module "audit_bucket" {
  source = "../modules/s3-bucket"

  name                    = local.audit_name
  kms_key_arn             = module.kms.key_arn
  versioning              = true
  noncurrent_version_days = 30
  extra_policy_json       = data.aws_iam_policy_document.audit_bucket.json

  retention_rules = [{
    id                = "expire-audit-logs"
    prefix            = "AWSLogs/"
    expire_after_days = var.audit_log_retention_days
  }]
}

resource "aws_cloudtrail" "audit" {
  # checkov:skip=CKV_AWS_252:A notification topic for trail delivery is not needed; delivery failures surface in the CloudTrail console and via the budget alarm on unexpected spend.
  # checkov:skip=CKV_AWS_35:The trail is encrypted with the account CMK.
  # checkov:skip=CKV2_AWS_10:CloudWatch Logs integration adds ingestion cost; add when a security alerting pipeline exists.
  name                          = local.trail_name
  s3_bucket_name                = module.audit_bucket.id
  is_multi_region_trail         = true
  include_global_service_events = true
  enable_log_file_validation    = true
  kms_key_id                    = module.kms.key_arn

  # The policy must exist before CloudTrail validates the bucket.
  depends_on = [module.audit_bucket]
}

# ------------------------------------------------------------ Account guards

resource "aws_s3_account_public_access_block" "this" {
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_accessanalyzer_analyzer" "this" {
  analyzer_name = "afterglow-account"
  type          = "ACCOUNT"
}

resource "aws_guardduty_detector" "this" {
  # checkov:skip=CKV2_AWS_3:GuardDuty bills by usage, so it is opt-in (var.enable_guardduty). This detector is the opt-in.
  count = var.enable_guardduty ? 1 : 0

  enable = true
}

# -------------------------------------------------------------------- Budget

resource "aws_budgets_budget" "monthly" {
  name         = "afterglow-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = [
      { type = "ACTUAL", threshold = 50 },
      { type = "ACTUAL", threshold = 80 },
      { type = "ACTUAL", threshold = 100 },
      { type = "FORECASTED", threshold = 100 },
    ]

    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value.threshold
      threshold_type             = "PERCENTAGE"
      notification_type          = notification.value.type
      subscriber_email_addresses = var.alert_emails
    }
  }
}

# ------------------------------------------- Optional: read-only CI for `plan`

resource "aws_iam_openid_connect_provider" "github" {
  count = var.enable_github_ci ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

# The trust CONDITIONS are plan-time constants in their own local so the tests
# can read them exactly. They are the one thing standing between the internet
# and this AWS account. The policy is then assembled around them; the provider
# ARN inside it is only known after apply, which is why the tests look at the
# conditions and not at the finished JSON.
locals {
  ci_trust_conditions = {
    StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
    # Pull requests and the main branch of this repository only. Not forks, not other branches.
    StringLike = {
      "token.actions.githubusercontent.com:sub" = [
        "repo:${local.github_repo}:pull_request",
        "repo:${local.github_repo}:ref:refs/heads/main",
      ]
    }
  }

  ci_trust_action = "sts:AssumeRoleWithWebIdentity"

  ci_trust_policy = var.enable_github_ci ? jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = local.ci_trust_action
      Principal = { Federated = aws_iam_openid_connect_provider.github[0].arn }
      Condition = local.ci_trust_conditions
    }]
  }) : null
}

data "aws_iam_policy_document" "ci_state_access" {
  count = var.enable_github_ci ? 1 : 0

  # `plan` reads state and writes then deletes a lock object next to it.
  statement {
    sid       = "StateObjects"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${module.state_bucket.arn}/*"]
  }

  statement {
    sid       = "StateBucketList"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [module.state_bucket.arn]
  }

  statement {
    sid       = "StateKey"
    effect    = "Allow"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
    resources = [module.kms.key_arn]
  }
}

resource "aws_iam_role" "ci_plan" {
  count = var.enable_github_ci ? 1 : 0

  name                 = "afterglow-ci-plan"
  description          = "Read-only: lets GitHub Actions run terraform plan. Cannot create, change or delete anything."
  assume_role_policy   = local.ci_trust_policy
  max_session_duration = 3600
}

# ViewOnlyAccess and SecurityAudit list and describe resources and read their
# configuration; neither reads S3 objects or DynamoDB items. If a plan fails
# with AccessDenied, add the specific missing read action; do not widen to
# ReadOnlyAccess, which can read data.
resource "aws_iam_role_policy_attachment" "ci_view_only" {
  count = var.enable_github_ci ? 1 : 0

  role       = aws_iam_role.ci_plan[0].name
  policy_arn = "arn:${local.partition}:iam::aws:policy/job-function/ViewOnlyAccess"
}

resource "aws_iam_role_policy_attachment" "ci_security_audit" {
  count = var.enable_github_ci ? 1 : 0

  role       = aws_iam_role.ci_plan[0].name
  policy_arn = "arn:${local.partition}:iam::aws:policy/SecurityAudit"
}

resource "aws_iam_role_policy" "ci_state" {
  count = var.enable_github_ci ? 1 : 0

  name   = "terraform-state"
  role   = aws_iam_role.ci_plan[0].id
  policy = data.aws_iam_policy_document.ci_state_access[0].json
}
