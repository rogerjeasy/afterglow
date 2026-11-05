# A hardened S3 bucket. Every Afterglow bucket is built from this module so the
# same guarantees hold everywhere:
#
#   - never public (all four public-access blocks, owner-enforced ownership)
#   - TLS 1.2 or newer only
#   - encrypted at rest (a customer-managed KMS key, or SSE-S3 for public-by-
#     design data such as map tiles that CloudFront must serve)
#   - never replicated to another region (privacy-aggregation.md rule 8)
#   - incomplete multipart uploads cleaned up

locals {
  uses_kms = var.kms_key_arn != null
}

resource "aws_s3_bucket" "this" {
  # checkov:skip=CKV_AWS_144:Cross-region replication is forbidden by data residency (ADR-004).
  # checkov:skip=CKV2_AWS_62:No event consumers exist yet; notifications are added with the service that needs them.
  # checkov:skip=CKV_AWS_21:Versioning is a module input. It is off only for server access logs, where it would keep deleted log objects past their 30-day retention.
  # checkov:skip=CKV_AWS_18:Access logging is enabled through aws_s3_bucket_logging when a log bucket is supplied; the log bucket itself cannot log to itself.
  bucket        = var.name
  force_destroy = var.force_destroy
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket                  = aws_s3_bucket.this.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    bucket_key_enabled = local.uses_kms

    apply_server_side_encryption_by_default {
      sse_algorithm     = local.uses_kms ? "aws:kms" : "AES256"
      kms_master_key_id = local.uses_kms ? var.kms_key_arn : null
    }
  }
}

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id

  versioning_configuration {
    status = var.versioning ? "Enabled" : "Suspended"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  dynamic "rule" {
    for_each = var.versioning ? [1] : []

    content {
      id     = "expire-noncurrent-versions"
      status = "Enabled"

      filter {}

      noncurrent_version_expiration {
        noncurrent_days = var.noncurrent_version_days
      }

      abort_incomplete_multipart_upload {
        days_after_initiation = 7
      }
    }
  }

  dynamic "rule" {
    for_each = var.retention_rules

    content {
      id     = rule.value.id
      status = "Enabled"

      filter {
        prefix = rule.value.prefix
      }

      expiration {
        days = rule.value.expire_after_days
      }

      abort_incomplete_multipart_upload {
        days_after_initiation = 7
      }

      dynamic "transition" {
        for_each = rule.value.transition_to_ia_after_days == null ? [] : [1]

        content {
          days          = rule.value.transition_to_ia_after_days
          storage_class = "STANDARD_IA"
        }
      }
    }
  }

  # Versioning must exist before a lifecycle rule that mentions versions.
  depends_on = [aws_s3_bucket_versioning.this]
}

data "aws_iam_policy_document" "this" {
  source_policy_documents = var.extra_policy_json == null ? [] : [var.extra_policy_json]

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.this.arn, "${aws_s3_bucket.this.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid       = "DenyOldTls"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.this.arn, "${aws_s3_bucket.this.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "NumericLessThan"
      variable = "s3:TlsVersion"
      values   = ["1.2"]
    }
  }
}

resource "aws_s3_bucket_policy" "this" {
  bucket = aws_s3_bucket.this.id
  policy = data.aws_iam_policy_document.this.json

  depends_on = [aws_s3_bucket_public_access_block.this]
}

resource "aws_s3_bucket_logging" "this" {
  count = var.enable_access_logging ? 1 : 0

  bucket        = aws_s3_bucket.this.id
  target_bucket = var.access_log_bucket
  target_prefix = "s3/${var.name}/"
}
