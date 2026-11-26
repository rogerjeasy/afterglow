variable "name" {
  description = "Name for the function, API and logs."
  type        = string
}

variable "business_table_name" {
  description = "Name of the business table (sites and logs keyed by the owner's Cognito sub)."
  type        = string
}

variable "business_table_arn" {
  description = "ARN of the business table."
  type        = string
}

variable "sites_table_name" {
  description = "Name of the public business status table."
  type        = string
}

variable "sites_table_arn" {
  description = "ARN of the public business status table."
  type        = string
}

variable "advisories_table_name" {
  description = "Name of the advisories table."
  type        = string
}

variable "advisories_table_arn" {
  description = "ARN of the advisories table."
  type        = string
}

variable "public_function_arn" {
  description = "ARN of the public API function, invoked asynchronously to push advisories."
  type        = string
}

variable "kms_key_arn" {
  description = "Key the tables are encrypted with."
  type        = string
}

variable "issuer" {
  description = "Cognito user pool issuer URL for the JWT authorizer."
  type        = string
}

variable "client_id" {
  description = "Cognito app client id (the JWT audience)."
  type        = string
}

variable "web_origins" {
  description = "Origins allowed by CORS."
  type        = list(string)
}

variable "bundle_path" {
  description = "Path to the bundled function (services/console/dist/index.mjs)."
  type        = string
}

variable "log_retention_days" {
  description = "Days to keep logs."
  type        = number
  default     = 30
}

variable "throttle_rate" {
  description = "Steady requests per second for the API."
  type        = number
  default     = 20
}

variable "throttle_burst" {
  description = "Burst requests for the API."
  type        = number
  default     = 40
}
