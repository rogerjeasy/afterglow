variable "name" {
  description = "Globally unique bucket name."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.name))
    error_message = "Bucket names must be 3 to 63 lowercase letters, numbers, dots or hyphens."
  }
}

variable "kms_key_arn" {
  description = "Customer-managed key for SSE-KMS. Null selects SSE-S3, for public-by-design data served through CloudFront."
  type        = string
  default     = null
}

variable "versioning" {
  description = "Keep object versions. Turn off only for data that must not outlive its retention (for example raw per-device data)."
  type        = bool
  default     = true
}

variable "noncurrent_version_days" {
  description = "Days to keep non-current versions when versioning is on."
  type        = number
  default     = 30
}

variable "retention_rules" {
  description = "Prefix-scoped expiry rules that enforce the retention promises in the privacy spec."
  type = list(object({
    id                          = string
    prefix                      = string
    expire_after_days           = number
    transition_to_ia_after_days = optional(number)
  }))
  default = []
}

variable "extra_policy_json" {
  description = "Additional bucket-policy JSON (for example a CloudFront origin-access statement), merged with the baseline denies."
  type        = string
  default     = null
}

variable "enable_access_logging" {
  description = "Send S3 server access logs to access_log_bucket. A plain flag, not derived from the bucket name, because the name may not be known until apply and Terraform must decide at plan time."
  type        = bool
  default     = false
}

variable "access_log_bucket" {
  description = "Name of the bucket that receives S3 server access logs. Used only when enable_access_logging is true."
  type        = string
  default     = null

  validation {
    condition     = var.access_log_bucket == null || var.enable_access_logging
    error_message = "access_log_bucket is set but enable_access_logging is false."
  }
}

variable "force_destroy" {
  description = "Allow Terraform to delete a non-empty bucket. Keep false outside throwaway environments."
  type        = bool
  default     = false
}
