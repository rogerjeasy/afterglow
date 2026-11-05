# One customer-managed key with rotation. Service principals that must use the
# key (an encrypted alarm topic, CloudTrail) are granted through
# `extra_statements`, each scoped by a condition.

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  account_root = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"

  statements = concat(
    [
      {
        # The standard statement that lets IAM policies govern the key. Without
        # it the key could not be managed at all. Access is then granted per role.
        Sid       = "EnableIamPolicies"
        Effect    = "Allow"
        Principal = { AWS = local.account_root }
        Action    = "kms:*"
        Resource  = "*"
      },
    ],
    var.extra_statements,
  )
}

resource "aws_kms_key" "this" {
  # checkov:skip=CKV_AWS_109:Standard key policy that delegates control to IAM; no other principal gets kms:*.
  # checkov:skip=CKV_AWS_111:Same statement; it is the AWS-documented default and is required to manage the key.
  # checkov:skip=CKV2_AWS_64:The key policy is defined explicitly above.
  description             = var.description
  enable_key_rotation     = true
  rotation_period_in_days = var.rotation_period_in_days
  deletion_window_in_days = var.deletion_window_in_days
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = local.statements
  })
}

resource "aws_kms_alias" "this" {
  name          = "alias/${var.alias}"
  target_key_id = aws_kms_key.this.key_id
}
