variable "alias" {
  description = "Key alias without the 'alias/' prefix."
  type        = string
}

variable "description" {
  description = "What the key protects."
  type        = string
}

variable "extra_statements" {
  description = "Additional key-policy statements (objects), for service principals. Each must carry a condition."
  type        = any
  default     = []
}

variable "rotation_period_in_days" {
  description = "Automatic rotation period (90 to 2560 days)."
  type        = number
  default     = 365

  validation {
    condition     = var.rotation_period_in_days >= 90 && var.rotation_period_in_days <= 2560
    error_message = "KMS rotation period must be between 90 and 2560 days."
  }
}

variable "deletion_window_in_days" {
  description = "Waiting period before a scheduled key deletion takes effect (7 to 30)."
  type        = number
  default     = 30

  validation {
    condition     = var.deletion_window_in_days >= 7 && var.deletion_window_in_days <= 30
    error_message = "Deletion window must be between 7 and 30 days."
  }
}
