variable "name" {
  description = "Name prefix for the function, role and API, for example afterglow-dev-eu-central-1-vault."
  type        = string
}

variable "table_name" {
  description = "The vault DynamoDB table name."
  type        = string
}

variable "table_arn" {
  description = "The vault DynamoDB table ARN. The function may touch this table and nothing else."
  type        = string
}

variable "kms_key_arn" {
  description = "The region's KMS key, which encrypts the vault table."
  type        = string
}

variable "issuer" {
  description = "Cognito token issuer URL (identity module output `issuer`)."
  type        = string
}

variable "client_id" {
  description = "Cognito app client ID. Tokens must have been issued to it."
  type        = string
}

variable "web_origins" {
  description = "Exact https origins allowed to call the API from a browser."
  type        = list(string)

  validation {
    condition     = length(var.web_origins) > 0 && alltrue([for o in var.web_origins : can(regex("^https://[a-z0-9.-]+$", o)) || can(regex("^http://localhost:[0-9]+$", o))])
    error_message = "Origins must be exact https origins (or http://localhost:<port> for development), without paths, wildcards or trailing slashes."
  }
}

variable "bundle_path" {
  description = "Path to the built Lambda bundle (services/vault/dist/index.mjs). Build it first: pnpm --filter @afterglow/vault-service build."
  type        = string
}

variable "log_retention_days" {
  description = "How long function and access logs are kept."
  type        = number
  default     = 30
}

variable "throttle_rate" {
  description = "Steady requests per second across the API, a brake against runaway clients."
  type        = number
  default     = 20
}

variable "throttle_burst" {
  description = "Burst requests across the API."
  type        = number
  default     = 40
}
