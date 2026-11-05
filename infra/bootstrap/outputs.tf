output "state_bucket" {
  description = "Bucket that holds Terraform state for every stack."
  value       = module.state_bucket.id
}

output "state_kms_key_arn" {
  description = "Key that encrypts the state bucket and the audit trail."
  value       = module.kms.key_arn
}

output "state_region" {
  description = "Region of the state bucket."
  value       = var.region
}

output "audit_trail_arn" {
  description = "ARN of the CloudTrail trail."
  value       = aws_cloudtrail.audit.arn
}

output "ci_plan_role_arn" {
  description = "Role GitHub Actions assumes to run terraform plan, or null when CI is not enabled."
  value       = var.enable_github_ci ? aws_iam_role.ci_plan[0].arn : null
}

output "backend_config_hint" {
  description = "Paste into infra/regional/envs/<env>-<region>.backend.hcl, changing key."
  value       = <<-EOT
    bucket       = "${module.state_bucket.id}"
    key          = "regional/<environment>-<region>/terraform.tfstate"
    region       = "${var.region}"
    encrypt      = true
    kms_key_id   = "${module.kms.key_arn}"
    use_lockfile = true
  EOT
}
