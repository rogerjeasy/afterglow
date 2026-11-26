# One self-contained Afterglow region (architecture 8.1, ADR-004).
#
# Everything here lives in a single AWS region and nothing is replicated to
# another one. A device or account is homed to one region by its declared
# country; per-device data never crosses a region boundary.
#
# What this stack creates today:
#   - a customer-managed KMS key for the region
#   - the DynamoDB tables from architecture 10.2 that have a defined shape
#   - S3 buckets for public data, analytics history, and private artefacts
#   - CloudFront in front of the public data bucket
#   - a Cognito user pool for optional accounts
#   - an encrypted alert topic and per-table throttle alarms
#
# What it deliberately does NOT create yet (see infra/README.md, "Not built
# yet, and why"): Kinesis, Managed Flink, OpenSearch Serverless, API Gateway
# and Lambda. Each either bills while idle or needs service code that does not
# exist; they are added with the service that uses them.

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition
  prefix     = "afterglow-${var.environment}-${var.region}"

  bucket_names = {
    for purpose in ["data", "history", "private", "logs"] :
    purpose => "${local.prefix}-${local.account_id}-${purpose}"
  }

  # Retention promises from the privacy spec, in one place (privacy-aggregation.md rule 7).
  retention = {
    raw_cell_windows_days = 30
    device_days           = 30
    roster_relay_days     = 7
    cell_history_days     = 1826 # five years, plus a day
    access_logs_days      = 30
  }

  tables = {
    # Raw 5-minute cell windows. 30-day TTL. No point-in-time recovery: a backup
    # would keep expired items for up to 35 days past the retention promise.
    # The change stream feeds the tile builder and alerting (architecture 8.3).
    cell_state = {
      hash_key      = { name = "geohash6", type = "S" }
      range_key     = { name = "windowStart", type = "N" }
      ttl_attribute = "expiresAt"
      pitr          = false
      stream        = "NEW_IMAGE"
    }
    # Normalised provider schedules; reproducible from the providers, so no backup.
    schedule = {
      hash_key      = { name = "providerArea", type = "S" }
      range_key     = { name = "windowStart", type = "N" }
      ttl_attribute = "expiresAt"
      pitr          = false
      stream        = null
    }
    # Latest adherence score per "utility#area".
    adherence = {
      hash_key      = { name = "utilityArea", type = "S" }
      range_key     = null
      ttl_attribute = null
      pitr          = false
      stream        = null
    }
    # Anonymous attested devices (the public key is the identity). Expires when stale.
    device = {
      hash_key      = { name = "deviceId", type = "S" }
      range_key     = null
      ttl_attribute = "expiresAt"
      pitr          = false
      stream        = null
    }
    # Ciphertext and routing metadata only, at most 7 days. No backup, on purpose.
    roster_relay = {
      hash_key      = { name = "pairId", type = "S" }
      range_key     = { name = "ts", type = "N" }
      ttl_attribute = "expiresAt"
      pitr          = false
      stream        = null
    }
    # The validated, signed formulary. "Formulary forever, with history", so it is
    # backed up. Written only by the review pipeline (label-only-medicine.md rule 5).
    formulary = {
      hash_key      = { name = "product", type = "S" }
      range_key     = { name = "labelVersion", type = "S" }
      ttl_attribute = null
      pitr          = true
      stream        = null
    }
    # One encrypted vault record per account, keyed by the Cognito subject. The
    # server stores ciphertext and KDF parameters only (ACC-18). Backed up,
    # because a lost vault cannot be recovered by anyone; deleted-account
    # ciphertext lingers in backups for up to 35 days (documented in the README).
    vault = {
      hash_key      = { name = "accountId", type = "S" }
      range_key     = { name = "record", type = "S" }
      ttl_attribute = null
      pitr          = true
      stream        = null
    }
  }
}

# ----------------------------------------------------------------------- KMS

module "kms" {
  source = "../modules/kms"

  alias       = local.prefix
  description = "Afterglow ${var.environment} ${var.region}: tables, private buckets and the alert topic"

  extra_statements = [
    {
      Sid       = "AllowCloudWatchAlarmsToPublishToTheEncryptedTopic"
      Effect    = "Allow"
      Principal = { Service = "cloudwatch.amazonaws.com" }
      Action    = ["kms:Decrypt", "kms:GenerateDataKey*"]
      Resource  = "*"
      Condition = { StringEquals = { "aws:SourceAccount" = local.account_id } }
    },
  ]
}

# ------------------------------------------------------------------- Buckets

# Server access logs. SSE-S3, because S3 cannot deliver logs to a KMS-encrypted
# bucket. Short retention: the logs hold requester IP addresses.
data "aws_iam_policy_document" "logs_bucket" {
  statement {
    sid       = "S3ServerAccessLogDelivery"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["arn:${local.partition}:s3:::${local.bucket_names.logs}/s3/*"]

    principals {
      type        = "Service"
      identifiers = ["logging.s3.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

module "logs_bucket" {
  source = "../modules/s3-bucket"

  name              = local.bucket_names.logs
  kms_key_arn       = null
  versioning        = false
  extra_policy_json = data.aws_iam_policy_document.logs_bucket.json

  retention_rules = [{
    id                = "expire-access-logs"
    prefix            = ""
    expire_after_days = local.retention.access_logs_days
  }]
}

# Public-by-design data (tiles, basemaps, signed snapshots, the client policy),
# served only through CloudFront. Aggregated and k-anonymous by construction, so
# SSE-S3 is enough, and CloudFront can read it without a key grant.
data "aws_iam_policy_document" "data_bucket" {
  statement {
    sid       = "AllowOnlyThisCloudFrontDistributionToRead"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["arn:${local.partition}:s3:::${local.bucket_names.data}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [module.edge.distribution_arn]
    }
  }
}

module "data_bucket" {
  source = "../modules/s3-bucket"

  name                    = local.bucket_names.data
  kms_key_arn             = null
  versioning              = true
  noncurrent_version_days = 7
  extra_policy_json       = data.aws_iam_policy_document.data_bucket.json
  enable_access_logging   = true
  access_log_bucket       = module.logs_bucket.id
  depends_on              = [module.logs_bucket]
}

# Aggregated cell history as Parquet, partitioned by region and date. Five years.
module "history_bucket" {
  source = "../modules/s3-bucket"

  name        = local.bucket_names.history
  kms_key_arn = module.kms.key_arn
  versioning  = true

  retention_rules = [{
    id                          = "expire-cell-history"
    prefix                      = "cells/"
    expire_after_days           = local.retention.cell_history_days
    transition_to_ia_after_days = 90
  }]

  enable_access_logging = true

  access_log_bucket = module.logs_bucket.id
  depends_on        = [module.logs_bucket]
}

# Private artefacts: phrase banks, report PDFs, formulary pipeline working files.
module "private_bucket" {
  source = "../modules/s3-bucket"

  name                  = local.bucket_names.private
  kms_key_arn           = module.kms.key_arn
  versioning            = true
  enable_access_logging = true
  access_log_bucket     = module.logs_bucket.id
  depends_on            = [module.logs_bucket]
}

# ---------------------------------------------------------------------- Edge

module "edge" {
  source = "../modules/edge"

  name_prefix = local.prefix
  # A string, not a module output, so the bucket policy can refer to the
  # distribution without creating a dependency cycle.
  origin_domain_name = "${local.bucket_names.data}.s3.${var.region}.amazonaws.com"
  allowed_origins    = var.web_origins
  price_class        = var.cdn_price_class
  web_acl_arn        = var.cdn_web_acl_arn
}

# ------------------------------------------------------------------- Tables

module "table" {
  for_each = local.tables
  source   = "../modules/dynamodb-table"

  name                    = "${local.prefix}-${replace(each.key, "_", "-")}"
  hash_key                = each.value.hash_key
  range_key               = each.value.range_key
  kms_key_arn             = module.kms.key_arn
  ttl_attribute           = each.value.ttl_attribute
  point_in_time_recovery  = each.value.pitr
  stream_view_type        = each.value.stream
  deletion_protection     = var.protect_resources
  max_write_request_units = var.table_max_write_units
  max_read_request_units  = var.table_max_read_units
}

# ------------------------------------------------------------------ Identity

module "identity" {
  source = "../modules/identity"

  name                      = "${local.prefix}-accounts"
  webauthn_relying_party_id = var.webauthn_relying_party_id
  deletion_protection       = var.protect_resources
  allow_self_signup         = var.allow_self_signup
  ses_source_arn            = var.ses_source_arn
  ses_from_address          = var.ses_from_address
  enable_email_otp          = var.enable_email_otp
}

# ------------------------------------------------------------------ Vault API

# Server accounts (.kiro/specs/cloud-accounts): API Gateway with a Cognito JWT
# authorizer in front of one function that stores each account's encrypted
# vault record, keyed by the verified `sub` only. Build the bundle first:
#   pnpm --filter @afterglow/vault-service build
module "vault_api" {
  source = "../modules/vault-api"

  name        = "${local.prefix}-vault"
  table_name  = module.table["vault"].name
  table_arn   = module.table["vault"].arn
  kms_key_arn = module.kms.key_arn
  issuer      = module.identity.issuer
  client_id   = module.identity.app_client_id
  web_origins = concat(var.web_origins, var.dev_origins)
  bundle_path = "${path.root}/../../services/vault/dist/index.mjs"
}

# ------------------------------------------------------------------- Alerting

module "alerts" {
  source = "../modules/alerts"

  name_prefix = local.prefix
  kms_key_arn = module.kms.key_arn
  emails      = var.alert_emails
}

# Any throttling at all on an on-demand table means a client is hammering it or
# the cost brake is too tight. One alarm per table combines reads and writes.
resource "aws_cloudwatch_metric_alarm" "table_throttling" {
  for_each = { for k, v in local.tables : k => v if var.enable_table_alarms }

  alarm_name          = "${local.prefix}-${replace(each.key, "_", "-")}-throttling"
  alarm_description   = "DynamoDB table ${each.key} is throttling requests."
  comparison_operator = "GreaterThanThreshold"
  threshold           = 5
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [module.alerts.topic_arn]

  metric_query {
    id          = "total"
    expression  = "reads + writes"
    label       = "Throttled events"
    return_data = true
  }

  metric_query {
    id = "reads"

    metric {
      namespace   = "AWS/DynamoDB"
      metric_name = "ReadThrottleEvents"
      period      = 300
      stat        = "Sum"
      dimensions  = { TableName = module.table[each.key].name }
    }
  }

  metric_query {
    id = "writes"

    metric {
      namespace   = "AWS/DynamoDB"
      metric_name = "WriteThrottleEvents"
      period      = 300
      stat        = "Sum"
      dimensions  = { TableName = module.table[each.key].name }
    }
  }
}
