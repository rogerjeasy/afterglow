variable "name_prefix" {
  description = "Prefix for the topic name."
  type        = string
}

variable "kms_key_arn" {
  description = "Customer-managed key that encrypts the topic. Its policy must let cloudwatch.amazonaws.com use it."
  type        = string
}

variable "emails" {
  description = "Addresses that receive alerts. Each must confirm the subscription by email."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for e in var.emails : can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", e))])
    error_message = "Each entry must be an email address."
  }
}
