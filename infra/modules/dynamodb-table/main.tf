# A DynamoDB table with Afterglow's defaults: on-demand billing, encryption with
# the regional customer-managed key, deletion protection, optional TTL, optional
# point-in-time recovery and an optional change stream.
#
# TTL is how retention is enforced (privacy-aggregation.md rule 7). DynamoDB
# deletes expired items in the background, typically within 48 hours of expiry,
# so readers MUST also ignore items whose TTL attribute is in the past. See
# infra/README.md, "Retention is two-part".

locals {
  # Only key attributes (and index keys) are declared; everything else is schemaless.
  key_attributes = merge(
    { (var.hash_key.name) = var.hash_key.type },
    var.range_key == null ? {} : { (var.range_key.name) = var.range_key.type },
    { for g in var.global_secondary_indexes : g.hash_key => g.hash_key_type },
    { for g in var.global_secondary_indexes : g.range_key => g.range_key_type if g.range_key != null },
  )
}

resource "aws_dynamodb_table" "this" {
  # checkov:skip=CKV_AWS_28:Point-in-time recovery is a per-table decision; tables holding data with a short retention promise must not keep deleted items for 35 days (see var.point_in_time_recovery).
  # checkov:skip=CKV2_AWS_16:Auto scaling does not apply to on-demand tables.
  name         = var.name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = var.hash_key.name
  range_key    = var.range_key == null ? null : var.range_key.name

  deletion_protection_enabled = var.deletion_protection
  table_class                 = "STANDARD"

  stream_enabled   = var.stream_view_type != null
  stream_view_type = var.stream_view_type

  dynamic "attribute" {
    for_each = local.key_attributes

    content {
      name = attribute.key
      type = attribute.value
    }
  }

  dynamic "ttl" {
    for_each = var.ttl_attribute == null ? [] : [1]

    content {
      attribute_name = var.ttl_attribute
      enabled        = true
    }
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  dynamic "global_secondary_index" {
    for_each = var.global_secondary_indexes

    content {
      name            = global_secondary_index.value.name
      hash_key        = global_secondary_index.value.hash_key
      range_key       = global_secondary_index.value.range_key
      projection_type = global_secondary_index.value.projection_type
    }
  }

  dynamic "on_demand_throughput" {
    for_each = var.max_write_request_units == null && var.max_read_request_units == null ? [] : [1]

    content {
      max_write_request_units = var.max_write_request_units
      max_read_request_units  = var.max_read_request_units
    }
  }
}
