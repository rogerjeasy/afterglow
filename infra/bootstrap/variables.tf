variable "aws_account_id" {
  description = "12-digit AWS account ID. Terraform refuses to run against any other account."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "The account ID must be exactly 12 digits."
  }
}

variable "region" {
  description = "Region for the state bucket and the audit trail's bucket. State is not tied to an application region; pick one close to you that is enabled by default."
  type        = string
  default     = "eu-central-1"
}

variable "alert_emails" {
  description = "Addresses that receive spend alerts. At least one, otherwise the budget would alert nobody."
  type        = list(string)

  validation {
    condition     = length(var.alert_emails) > 0 && alltrue([for e in var.alert_emails : can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", e))])
    error_message = "Provide at least one valid email address."
  }
}

variable "monthly_budget_usd" {
  description = "Monthly spend (USD) at which alerts fire at 50%, 80% and 100% of actual cost, and at 100% of forecast. This is an alert, not a hard cap: AWS Budgets does not stop spending."
  type        = number
  default     = 50

  validation {
    condition     = var.monthly_budget_usd > 0
    error_message = "The budget must be positive."
  }
}

variable "audit_log_retention_days" {
  description = "How long CloudTrail logs are kept."
  type        = number
  default     = 400
}

variable "enable_github_ci" {
  description = "Create the GitHub OIDC provider and a read-only role that can run `terraform plan` from CI. Off by default: nothing trusts GitHub until you ask. There is intentionally no apply role."
  type        = bool
  default     = false
}

variable "github_repository" {
  description = "owner/name of the repository allowed to assume the plan role."
  type        = string
  default     = "rogerjeasy/afterglow"

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "Use owner/name, for example rogerjeasy/afterglow."
  }
}

variable "enable_guardduty" {
  description = "Turn on GuardDuty threat detection for this account and region. Billed by usage after a 30-day trial."
  type        = bool
  default     = false
}
