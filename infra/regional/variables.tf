variable "aws_account_id" {
  description = "12-digit AWS account ID this stack belongs to. Terraform refuses to run against any other account."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "The account ID must be exactly 12 digits."
  }
}

variable "environment" {
  description = "Deployment environment."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging or prod."
  }
}

variable "region" {
  description = "AWS region of this self-contained stack. Data never leaves it (ADR-004)."
  type        = string

  validation {
    condition     = contains(["af-south-1", "eu-central-1", "us-east-1", "ap-south-1", "me-south-1"], var.region)
    error_message = "region must be one of the five Afterglow regions: af-south-1, eu-central-1, us-east-1, ap-south-1, me-south-1. af-south-1 and me-south-1 must be enabled on the account first."
  }
}

variable "protect_resources" {
  description = "Turn on deletion protection for tables and the user pool. Keep true for anything holding real data."
  type        = bool
  default     = true
}

variable "alert_emails" {
  description = "Addresses that receive operational alerts. Each must confirm a subscription email."
  type        = list(string)
  default     = []
}

variable "web_origins" {
  description = "Exact https origins of the web app that may fetch public data in a browser, for example https://afterglow-flax.vercel.app. No wildcards."
  type        = list(string)

  validation {
    condition     = length(var.web_origins) > 0 && alltrue([for o in var.web_origins : can(regex("^https://[^*/]+$", o))])
    error_message = "Each origin must be an https origin with no wildcard, path or trailing slash."
  }
}

variable "webauthn_relying_party_id" {
  description = "Domain that passkeys are bound to. Changing it later invalidates every registered passkey."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", var.webauthn_relying_party_id))
    error_message = "Use a bare domain name with no scheme, port or path."
  }
}

variable "allow_self_signup" {
  description = "Let people create their own accounts."
  type        = bool
  default     = true
}

variable "ses_source_arn" {
  description = "Verified Amazon SES identity ARN for account email. Null uses Cognito's limited built-in sender (development only)."
  type        = string
  default     = null
}

variable "ses_from_address" {
  description = "From address when ses_source_arn is set."
  type        = string
  default     = null
}

variable "enable_email_otp" {
  description = "Allow email one-time codes as a sign-in factor. Needs SES."
  type        = bool
  default     = false
}

variable "cdn_price_class" {
  description = "CloudFront price class. PriceClass_100 omits Africa, Asia and the Middle East edges; use PriceClass_All where users are there."
  type        = string
  default     = "PriceClass_All"
}

variable "cdn_web_acl_arn" {
  description = "WAFv2 web ACL (created in us-east-1) to attach to the distribution, or null."
  type        = string
  default     = null
}

variable "enable_table_alarms" {
  description = "Create a throttling alarm per table (about $0.10 a month each)."
  type        = bool
  default     = true
}

variable "table_max_write_units" {
  description = "Per-table ceiling on write units per second: a cost brake against runaway clients. Null means unlimited."
  type        = number
  default     = null
}

variable "table_max_read_units" {
  description = "Per-table ceiling on read units per second: a cost brake. Null means unlimited."
  type        = number
  default     = null
}

variable "dev_origins" {
  description = "Extra origins allowed to call the vault API, for local development and browser tests only, for example http://localhost:5173. Leave empty in production."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for o in var.dev_origins : can(regex("^http://localhost:[0-9]+$", o))])
    error_message = "Development origins must be http://localhost:<port>."
  }
}
