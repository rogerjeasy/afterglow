variable "name" {
  description = "Table name."
  type        = string
}

variable "hash_key" {
  description = "Partition key."
  type = object({
    name = string
    type = string
  })

  validation {
    condition     = contains(["S", "N", "B"], var.hash_key.type)
    error_message = "Key type must be S, N or B."
  }
}

variable "range_key" {
  description = "Sort key, or null."
  type = object({
    name = string
    type = string
  })
  default = null

  validation {
    condition     = var.range_key == null || contains(["S", "N", "B"], var.range_key.type)
    error_message = "Key type must be S, N or B."
  }
}

variable "kms_key_arn" {
  description = "Customer-managed key used for server-side encryption."
  type        = string
}

variable "ttl_attribute" {
  description = "Name of the epoch-seconds attribute that expires items, or null for no TTL."
  type        = string
  default     = null
}

variable "point_in_time_recovery" {
  description = "Continuous backups (35 days). Leave off where deleted items must not linger past a retention promise."
  type        = bool
  default     = false
}

variable "deletion_protection" {
  description = "Refuse to delete the table until this is turned off."
  type        = bool
  default     = true
}

variable "stream_view_type" {
  description = "Change stream view type, or null for no stream."
  type        = string
  default     = null

  validation {
    condition     = var.stream_view_type == null || contains(["KEYS_ONLY", "NEW_IMAGE", "OLD_IMAGE", "NEW_AND_OLD_IMAGES"], coalesce(var.stream_view_type, "KEYS_ONLY"))
    error_message = "Invalid stream view type."
  }
}

variable "global_secondary_indexes" {
  description = "Secondary indexes. Add one only where a second access path is real (architecture 10.2)."
  type = list(object({
    name            = string
    hash_key        = string
    hash_key_type   = string
    range_key       = optional(string)
    range_key_type  = optional(string)
    projection_type = optional(string, "ALL")
  }))
  default = []
}

variable "max_write_request_units" {
  description = "Ceiling on write units per second (a cost brake). Null means unlimited."
  type        = number
  default     = null
}

variable "max_read_request_units" {
  description = "Ceiling on read units per second (a cost brake). Null means unlimited."
  type        = number
  default     = null
}
