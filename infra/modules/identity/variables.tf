variable "name" {
  description = "User pool name."
  type        = string
}

variable "webauthn_relying_party_id" {
  description = <<-EOT
    Domain that passkeys are bound to, for example "afterglow-flax.vercel.app".
    A passkey only works on this exact domain (or a parent of it). Changing it
    later makes every registered passkey unusable, so set it to the domain you
    will keep, such as a custom domain, before people register passkeys.
  EOT
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", var.webauthn_relying_party_id))
    error_message = "Use a bare domain name with no scheme, port or path."
  }
}

variable "deletion_protection" {
  description = "Refuse to delete the pool (and every account in it)."
  type        = bool
  default     = true
}

variable "allow_self_signup" {
  description = "Let people create their own accounts. False restricts creation to administrators."
  type        = bool
  default     = true
}

variable "refresh_token_days" {
  description = "How long a sign-in lasts without the person returning (1 to 365)."
  type        = number
  default     = 30

  validation {
    condition     = var.refresh_token_days >= 1 && var.refresh_token_days <= 365
    error_message = "Refresh token validity must be 1 to 365 days."
  }
}

variable "ses_source_arn" {
  description = "ARN of a verified Amazon SES identity for sending email. Null uses Cognito's built-in sender, which is limited to about 50 emails a day and is for development only."
  type        = string
  default     = null
}

variable "ses_from_address" {
  description = "From address, required when ses_source_arn is set."
  type        = string
  default     = null
}

variable "enable_email_otp" {
  description = "Allow one-time email codes as a first sign-in factor. Takes effect only when SES is configured."
  type        = bool
  default     = false
}
