# The promises every Afterglow bucket makes, checked on the planned resources.
# Offline: mocked provider, no credentials, nothing is created.

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  name = "afterglow-test-123456789012-example"
}

run "never_public_and_owner_enforced" {
  command = plan

  assert {
    condition = (
      aws_s3_bucket_public_access_block.this.block_public_acls == true &&
      aws_s3_bucket_public_access_block.this.block_public_policy == true &&
      aws_s3_bucket_public_access_block.this.ignore_public_acls == true &&
      aws_s3_bucket_public_access_block.this.restrict_public_buckets == true
    )
    error_message = "All four public-access blocks must be on."
  }

  assert {
    condition     = one(aws_s3_bucket_ownership_controls.this.rule).object_ownership == "BucketOwnerEnforced"
    error_message = "ACLs must be disabled with BucketOwnerEnforced."
  }

  assert {
    condition     = aws_s3_bucket.this.force_destroy == false
    error_message = "A non-empty bucket must not be deletable by default."
  }
}

run "kms_key_selects_sse_kms_with_bucket_keys" {
  command = plan

  variables {
    kms_key_arn = "arn:aws:kms:eu-central-1:123456789012:key/11111111-2222-3333-4444-555555555555"
  }

  assert {
    condition = (
      one(one(aws_s3_bucket_server_side_encryption_configuration.this.rule).apply_server_side_encryption_by_default).sse_algorithm == "aws:kms" &&
      one(aws_s3_bucket_server_side_encryption_configuration.this.rule).bucket_key_enabled == true
    )
    error_message = "A supplied key must select SSE-KMS with bucket keys."
  }
}

run "no_key_means_sse_s3_only_for_public_by_design_data" {
  command = plan

  assert {
    condition     = one(one(aws_s3_bucket_server_side_encryption_configuration.this.rule).apply_server_side_encryption_by_default).sse_algorithm == "AES256"
    error_message = "Without a key the bucket must still be encrypted (SSE-S3)."
  }
}

run "versioning_follows_the_flag" {
  command = plan

  assert {
    condition     = aws_s3_bucket_versioning.this.versioning_configuration[0].status == "Enabled"
    error_message = "Versioning is on by default."
  }
}

run "versioning_can_be_suspended_for_data_that_must_not_linger" {
  command = plan

  variables {
    versioning = false
  }

  assert {
    condition     = aws_s3_bucket_versioning.this.versioning_configuration[0].status == "Suspended"
    error_message = "versioning=false must suspend versioning."
  }
}

run "incomplete_uploads_are_always_cleaned_up" {
  command = plan

  assert {
    condition = anytrue([
      for r in aws_s3_bucket_lifecycle_configuration.this.rule :
      r.id == "abort-incomplete-multipart" && one(r.abort_incomplete_multipart_upload).days_after_initiation == 7
    ])
    error_message = "A 7-day multipart abort rule must always exist."
  }
}

run "retention_rules_become_expiry_rules" {
  command = plan

  variables {
    retention_rules = [{
      id                          = "expire-cell-history"
      prefix                      = "cells/"
      expire_after_days           = 1826
      transition_to_ia_after_days = 90
    }]
  }

  assert {
    condition = anytrue([
      for r in aws_s3_bucket_lifecycle_configuration.this.rule :
      r.id == "expire-cell-history" && one(r.expiration).days == 1826
    ])
    error_message = "The retention rule must expire objects after the stated days."
  }
}

run "noncurrent_versions_expire_when_versioning_is_on" {
  command = plan

  assert {
    condition = anytrue([
      for r in aws_s3_bucket_lifecycle_configuration.this.rule :
      r.id == "expire-noncurrent-versions"
    ])
    error_message = "Old versions must not accumulate forever."
  }
}

run "access_logging_is_off_unless_asked_for" {
  command = plan

  assert {
    condition     = length(aws_s3_bucket_logging.this) == 0
    error_message = "Logging must be opt-in."
  }
}

run "access_logging_when_enabled" {
  command = plan

  variables {
    enable_access_logging = true
    access_log_bucket     = "afterglow-test-logs"
  }

  assert {
    condition     = length(aws_s3_bucket_logging.this) == 1
    error_message = "Logging must be created when enabled."
  }
}

run "a_log_bucket_without_the_flag_is_rejected" {
  command = plan

  variables {
    access_log_bucket = "afterglow-test-logs"
  }

  expect_failures = [var.access_log_bucket]
}

run "bucket_names_must_be_valid" {
  command = plan

  variables {
    name = "Not_A_Valid_Name"
  }

  expect_failures = [var.name]
}
