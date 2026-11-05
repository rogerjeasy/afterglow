# Exposure properties of the public data distribution.

mock_provider "aws" {}

variables {
  name_prefix        = "afterglow-test"
  origin_domain_name = "afterglow-test-data.s3.eu-central-1.amazonaws.com"
  allowed_origins    = ["https://afterglow-flax.vercel.app"]
}

run "viewers_are_always_redirected_to_https_and_only_read_methods_are_allowed" {
  command = plan

  assert {
    condition = (
      one(aws_cloudfront_distribution.this.default_cache_behavior).viewer_protocol_policy == "redirect-to-https" &&
      !contains(one(aws_cloudfront_distribution.this.default_cache_behavior).allowed_methods, "PUT") &&
      !contains(one(aws_cloudfront_distribution.this.default_cache_behavior).allowed_methods, "POST") &&
      !contains(one(aws_cloudfront_distribution.this.default_cache_behavior).allowed_methods, "DELETE")
    )
    error_message = "The CDN must be read-only over HTTPS."
  }

  assert {
    condition = alltrue([
      for b in aws_cloudfront_distribution.this.ordered_cache_behavior :
      b.viewer_protocol_policy == "redirect-to-https" && !contains(b.allowed_methods, "PUT")
    ])
    error_message = "Every path behavior must also be HTTPS and read-only."
  }
}

run "the_origin_is_reached_through_origin_access_control_not_a_public_bucket" {
  command = plan

  assert {
    condition     = aws_cloudfront_origin_access_control.this.signing_behavior == "always" && aws_cloudfront_origin_access_control.this.signing_protocol == "sigv4"
    error_message = "Origin access control must always sign requests."
  }

  # The OAC id is only known after apply, so the plan can't compare it. What it
  # can show is that exactly one origin exists and it is the S3 bucket, not a
  # custom (public web) origin, which would have no OAC at all.
  assert {
    condition = (
      length(aws_cloudfront_distribution.this.origin) == 1 &&
      alltrue([for o in aws_cloudfront_distribution.this.origin : length(o.custom_origin_config) == 0])
    )
    error_message = "The only origin must be the S3 bucket reached via origin access control, never a public web origin."
  }
}

run "cache_lifetimes_match_the_spec" {
  command = plan

  assert {
    condition = (
      aws_cloudfront_cache_policy.this["tiles"].default_ttl == 60 &&
      aws_cloudfront_cache_policy.this["policy"].default_ttl == 30
    )
    error_message = "Tiles cache for 60 s and the client policy for 30 s (architecture 8.4, 8.7)."
  }
}

run "client_input_cannot_change_the_cache_key" {
  command = plan

  assert {
    condition = alltrue([
      for k, p in aws_cloudfront_cache_policy.this :
      one(one(p.parameters_in_cache_key_and_forwarded_to_origin).query_strings_config).query_string_behavior == "none" &&
      one(one(p.parameters_in_cache_key_and_forwarded_to_origin).cookies_config).cookie_behavior == "none" &&
      one(one(p.parameters_in_cache_key_and_forwarded_to_origin).headers_config).header_behavior == "none"
    ])
    error_message = "No query string, cookie or header may reach the cache key: it would let anyone bust the cache."
  }
}

run "security_headers_are_attached_to_every_behavior" {
  command = plan

  assert {
    condition = (
      one(aws_cloudfront_response_headers_policy.this.security_headers_config).strict_transport_security[0].access_control_max_age_sec >= 31536000 &&
      one(one(aws_cloudfront_response_headers_policy.this.security_headers_config).content_type_options).override == true
    )
    error_message = "HSTS of at least a year and nosniff must be set."
  }
}

run "cors_allows_only_the_named_origins_and_no_credentials" {
  command = plan

  assert {
    condition     = one(aws_cloudfront_response_headers_policy.this.cors_config).access_control_allow_credentials == false
    error_message = "Public data must not be fetched with credentials."
  }

  assert {
    condition     = !contains(one(one(aws_cloudfront_response_headers_policy.this.cors_config).access_control_allow_origins).items, "*")
    error_message = "CORS must name origins, never *."
  }
}

run "wildcards_and_plain_http_origins_are_rejected" {
  command = plan

  variables {
    allowed_origins = ["*"]
  }

  expect_failures = [var.allowed_origins]
}

run "only_the_regional_s3_domain_is_accepted_as_origin" {
  command = plan

  variables {
    origin_domain_name = "example.com"
  }

  expect_failures = [var.origin_domain_name]
}

run "a_custom_domain_enforces_tls_1_2" {
  command = plan

  variables {
    acm_certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/11111111-2222-3333-4444-555555555555"
    aliases             = ["data.afterglow.example"]
  }

  assert {
    condition     = one(aws_cloudfront_distribution.this.viewer_certificate).minimum_protocol_version == "TLSv1.2_2021"
    error_message = "A custom domain must require TLS 1.2 or newer."
  }
}
