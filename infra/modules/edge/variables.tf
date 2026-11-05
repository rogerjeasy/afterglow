variable "name_prefix" {
  description = "Prefix for named resources, for example 'afterglow-prod-eu-central-1'."
  type        = string
}

variable "origin_domain_name" {
  description = "Regional domain of the data bucket, as a string such as 'bucket.s3.eu-central-1.amazonaws.com'. Passed as a string, not a module output, so the bucket policy can reference this distribution without a dependency cycle."
  type        = string

  validation {
    condition     = can(regex("\\.s3\\.[a-z0-9-]+\\.amazonaws\\.com$", var.origin_domain_name))
    error_message = "Use the regional S3 domain: <bucket>.s3.<region>.amazonaws.com."
  }
}

variable "allowed_origins" {
  description = "Exact web origins allowed to fetch the data from a browser, such as 'https://afterglow-flax.vercel.app'. No wildcards."
  type        = list(string)

  validation {
    condition     = length(var.allowed_origins) > 0 && alltrue([for o in var.allowed_origins : can(regex("^https://[^*/]+$", o))])
    error_message = "Each origin must be an https origin with no wildcard, path or trailing slash."
  }
}

variable "price_class" {
  description = "PriceClass_100 serves North America and Europe only; PriceClass_All includes Africa, Asia and the Middle East."
  type        = string
  default     = "PriceClass_All"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "Invalid price class."
  }
}

variable "acm_certificate_arn" {
  description = "ACM certificate (must be in us-east-1) for a custom domain. Null uses the default cloudfront.net certificate."
  type        = string
  default     = null
}

variable "aliases" {
  description = "Custom domain names, used only with acm_certificate_arn."
  type        = list(string)
  default     = []
}

variable "web_acl_arn" {
  description = "ARN of a WAFv2 web ACL created in us-east-1, or null."
  type        = string
  default     = null
}
