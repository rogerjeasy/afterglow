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
