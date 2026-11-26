output "region" {
  description = "Region this stack lives in."
  value       = var.region
}

output "kms_key_arn" {
  description = "Regional customer-managed key."
  value       = module.kms.key_arn
}

output "tables" {
  description = "DynamoDB table names and ARNs by logical name."
  value = {
    for k, t in module.table : k => {
      name       = t.name
      arn        = t.arn
      stream_arn = t.stream_arn
    }
  }
}

output "buckets" {
  description = "Bucket names by purpose."
  value = {
    data    = module.data_bucket.id
    history = module.history_bucket.id
    private = module.private_bucket.id
    logs    = module.logs_bucket.id
  }
}

output "cdn_domain_name" {
  description = "Public data host, for example for the app's tile and snapshot URLs."
  value       = module.edge.domain_name
}

output "accounts" {
  description = "Values the web app needs for optional server accounts. None of these is a secret."
  value = {
    region        = var.region
    user_pool_id  = module.identity.user_pool_id
    app_client_id = module.identity.app_client_id
    issuer        = module.identity.issuer
    vault_api_url = module.vault_api.api_url
  }
}

output "public_api_url" {
  description = "Base URL of the anonymous public API (crowd reports, cells, places, weather). Not a secret."
  value       = module.public_api.api_url
}

output "alerts_topic_arn" {
  description = "Encrypted SNS topic that alarms publish to."
  value       = module.alerts.topic_arn
}
