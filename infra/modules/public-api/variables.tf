variable "name" {
  description = "Name prefix for the function, role and API."
  type        = string
}

variable "reports_table_arn" {
  description = "The crowd reports table (2-hour TTL)."
  type        = string
}

variable "reports_table_name" {
  type        = string
  description = "Name of the crowd reports table."
}

variable "device_table_arn" {
  description = "The anonymous device-key table (2-day TTL)."
  type        = string
}

variable "device_table_name" {
  type        = string
  description = "Name of the device-key table."
}

variable "cache_table_arn" {
  description = "The public-data cache table (places, weather)."
  type        = string
}

variable "cache_table_name" {
  type        = string
  description = "Name of the public-data cache table."
}

variable "kms_key_arn" {
  description = "The region's KMS key, which encrypts the tables."
  type        = string
}

variable "web_origins" {
  description = "Exact origins allowed to call the API from a browser."
  type        = list(string)

  validation {
    condition     = length(var.web_origins) > 0 && alltrue([for o in var.web_origins : can(regex("^https://[a-z0-9.-]+$", o)) || can(regex("^http://localhost:[0-9]+$", o))])
    error_message = "Origins must be exact https origins (or http://localhost:<port>), without paths or wildcards."
  }
}

variable "bundle_path" {
  description = "Path to the built bundle (services/crowd/dist/index.mjs)."
  type        = string
}

variable "log_retention_days" {
  type        = number
  default     = 30
  description = "How long function and access logs are kept."
}

variable "throttle_rate" {
  type        = number
  default     = 50
  description = "Steady requests per second across the API."
}

variable "throttle_burst" {
  type        = number
  default     = 100
  description = "Burst requests across the API."
}

variable "push_table_arn" {
  description = "ARN of the push subscriptions table."
  type        = string
}

variable "push_table_name" {
  description = "Name of the push subscriptions table."
  type        = string
}

variable "vapid_param_name" {
  description = "Parameter Store name of the VAPID key pair (a SecureString created outside Terraform, so the private key is never in state)."
  type        = string
  validation {
    condition     = can(regex("^/afterglow/[a-z0-9-]+/vapid$", var.vapid_param_name))
    error_message = "vapid_param_name must look like /afterglow/<env>-<region>/vapid."
  }
}

variable "history_table_arn" {
  description = "ARN of the cell history table (cell_state): published 5-minute windows, 30 days."
  type        = string
}

variable "history_table_name" {
  description = "Name of the cell history table."
  type        = string
}

variable "advisories_table_arn" {
  description = "ARN of the advisories table (read here; written by the console)."
  type        = string
}

variable "advisories_table_name" {
  description = "Name of the advisories table."
  type        = string
}

variable "sites_table_arn" {
  description = "ARN of the public business status table (read here; written by the console)."
  type        = string
}

variable "sites_table_name" {
  description = "Name of the public business status table."
  type        = string
}

variable "ask_model_id" {
  description = "Bedrock inference profile that phrases Ask answers from library passages; empty disables phrasing."
  type        = string
  default     = ""
}

variable "ask_model_resources" {
  description = "ARNs the function may invoke for Ask: the inference profile and the foundation model behind it."
  type        = list(string)
  default     = []
}
