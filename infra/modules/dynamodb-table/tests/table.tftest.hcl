# DynamoDB defaults and retention behaviour, checked on the planned resource.

mock_provider "aws" {}

variables {
  name        = "afterglow-test-cell-state"
  kms_key_arn = "arn:aws:kms:eu-central-1:123456789012:key/11111111-2222-3333-4444-555555555555"
  hash_key    = { name = "geohash6", type = "S" }
}

run "on_demand_encrypted_and_protected_by_default" {
  command = plan

  assert {
    condition     = aws_dynamodb_table.this.billing_mode == "PAY_PER_REQUEST"
    error_message = "Tables must be on-demand (no idle cost, burst-proof)."
  }

  assert {
    condition = (
      one(aws_dynamodb_table.this.server_side_encryption).enabled == true &&
      one(aws_dynamodb_table.this.server_side_encryption).kms_key_arn == var.kms_key_arn
    )
    error_message = "Tables must be encrypted with the supplied customer-managed key."
  }

  assert {
    condition     = aws_dynamodb_table.this.deletion_protection_enabled == true
    error_message = "Deletion protection must default to on."
  }
}

run "no_backup_by_default_so_short_retention_promises_hold" {
  command = plan

  assert {
    condition     = one(aws_dynamodb_table.this.point_in_time_recovery).enabled == false
    error_message = "Point-in-time recovery must be opt-in."
  }
}

run "backup_when_asked" {
  command = plan

  variables {
    point_in_time_recovery = true
  }

  assert {
    condition     = one(aws_dynamodb_table.this.point_in_time_recovery).enabled == true
    error_message = "PITR flag must be honoured."
  }
}

run "ttl_enforces_retention" {
  command = plan

  variables {
    ttl_attribute = "expiresAt"
  }

  assert {
    condition = (
      one(aws_dynamodb_table.this.ttl).attribute_name == "expiresAt" &&
      one(aws_dynamodb_table.this.ttl).enabled == true
    )
    error_message = "TTL must be enabled on the named attribute."
  }
}

run "no_ttl_unless_named" {
  command = plan

  assert {
    condition     = length(aws_dynamodb_table.this.ttl) == 0
    error_message = "TTL must be absent unless an attribute is named."
  }
}

run "only_key_attributes_are_declared" {
  command = plan

  variables {
    range_key = { name = "windowStart", type = "N" }
  }

  assert {
    condition     = length(aws_dynamodb_table.this.attribute) == 2
    error_message = "Only the hash and range keys should be declared."
  }
}

run "an_index_declares_its_own_key_attributes" {
  command = plan

  variables {
    global_secondary_indexes = [{
      name           = "by-owner"
      hash_key       = "owner"
      hash_key_type  = "S"
      range_key      = "createdAt"
      range_key_type = "N"
    }]
  }

  assert {
    condition     = length(aws_dynamodb_table.this.attribute) == 3
    error_message = "Index keys must be declared as attributes (hash key plus owner and createdAt, deduplicated)."
  }
}

run "stream_only_when_requested" {
  command = plan

  assert {
    condition     = aws_dynamodb_table.this.stream_enabled == false
    error_message = "No stream by default."
  }
}

run "stream_when_requested" {
  command = plan

  variables {
    stream_view_type = "NEW_IMAGE"
  }

  assert {
    condition     = aws_dynamodb_table.this.stream_enabled == true && aws_dynamodb_table.this.stream_view_type == "NEW_IMAGE"
    error_message = "Stream must follow the variable."
  }
}

run "cost_brake_is_optional_and_applies_when_set" {
  command = plan

  variables {
    max_write_request_units = 1000
    max_read_request_units  = 2000
  }

  assert {
    condition     = one(aws_dynamodb_table.this.on_demand_throughput).max_write_request_units == 1000
    error_message = "The throughput ceiling must be applied."
  }
}

run "bad_key_types_are_rejected" {
  command = plan

  variables {
    hash_key = { name = "id", type = "X" }
  }

  expect_failures = [var.hash_key]
}
