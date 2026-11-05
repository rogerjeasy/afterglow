# CloudFront in front of the public-by-design data bucket: vector tiles, PMTiles
# basemaps, formulary and food snapshots, and the signed client-policy document
# (architecture 8.4 and 8.7). The bucket itself stays private; only this
# distribution can read it, through origin access control.
#
# Cache lifetimes follow the spec:
#   tiles      60 s   (a metro-wide event is one origin fetch per tile)
#   policy     30 s   (the storm-mode control plane is the one "instant" switch)
#   snapshots  1 day  (signed, versioned, immutable per version)

locals {
  cache_classes = {
    tiles     = { default_ttl = 60, min_ttl = 0, max_ttl = 120 }
    policy    = { default_ttl = 30, min_ttl = 0, max_ttl = 60 }
    snapshots = { default_ttl = 86400, min_ttl = 0, max_ttl = 604800 }
    default   = { default_ttl = 300, min_ttl = 0, max_ttl = 600 }
  }

  has_custom_domain = var.acm_certificate_arn != null
  origin_id         = "data-bucket"
}

resource "aws_cloudfront_origin_access_control" "this" {
  name                              = "${var.name_prefix}-data"
  description                       = "Read access to the data bucket for ${var.name_prefix}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_cache_policy" "this" {
  for_each = local.cache_classes

  name        = "${var.name_prefix}-${each.key}"
  comment     = "Afterglow ${each.key} cache lifetimes"
  default_ttl = each.value.default_ttl
  min_ttl     = each.value.min_ttl
  max_ttl     = each.value.max_ttl

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    # Nothing from the client may change what is cached or fetched: a query
    # string cannot be used to bust the cache and hammer the origin.
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

resource "aws_cloudfront_response_headers_policy" "this" {
  name    = "${var.name_prefix}-data"
  comment = "Security headers and CORS for public data"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "no-referrer"
      override        = true
    }
  }

  custom_headers_config {
    items {
      header   = "Cross-Origin-Resource-Policy"
      value    = "cross-origin"
      override = true
    }
  }

  # The app fetches tiles from another origin; PMTiles needs byte ranges.
  cors_config {
    access_control_allow_credentials = false
    origin_override                  = true
    access_control_max_age_sec       = 600

    access_control_allow_headers {
      items = ["Range", "If-Match", "If-None-Match"]
    }
    access_control_allow_methods {
      items = ["GET", "HEAD", "OPTIONS"]
    }
    access_control_allow_origins {
      items = var.allowed_origins
    }
    access_control_expose_headers {
      items = ["Content-Range", "Content-Length", "Accept-Ranges", "ETag"]
    }
  }
}

resource "aws_cloudfront_distribution" "this" {
  # checkov:skip=CKV_AWS_305:This is a data CDN for tiles and snapshots, not a website; there is no index document.
  # checkov:skip=CKV_AWS_374:Geo restriction is wrong for this product: people in blackout regions are the audience, and blocking countries would be a defect.
  # checkov:skip=CKV_AWS_86:Access logging is off by default to avoid a second bucket and its cost; enable with var.log_bucket_domain when needed.
  # checkov:skip=CKV_AWS_310:A second origin for failover is not useful: the origin is a single-region bucket by residency design.
  # checkov:skip=CKV2_AWS_32:A response headers policy is attached to every behavior.
  # checkov:skip=CKV2_AWS_47:WAF is optional (var.web_acl_arn); it adds a monthly charge and is enabled for production.
  # checkov:skip=CKV_AWS_174:TLS 1.2 or newer is enforced when a custom domain and certificate are supplied. CloudFront's default certificate cannot be set above TLS 1.0 by the API.
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  comment         = "${var.name_prefix} public data"
  price_class     = var.price_class
  aliases         = local.has_custom_domain ? var.aliases : []
  web_acl_id      = var.web_acl_arn

  origin {
    domain_name              = var.origin_domain_name
    origin_id                = local.origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.this.id
  }

  default_cache_behavior {
    target_origin_id           = local.origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.this["default"].id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.this.id
  }

  dynamic "ordered_cache_behavior" {
    for_each = {
      "/tiles/*"     = "tiles"
      "/policy/*"    = "policy"
      "/snapshots/*" = "snapshots"
    }

    content {
      path_pattern               = ordered_cache_behavior.key
      target_origin_id           = local.origin_id
      viewer_protocol_policy     = "redirect-to-https"
      allowed_methods            = ["GET", "HEAD", "OPTIONS"]
      cached_methods             = ["GET", "HEAD"]
      compress                   = true
      cache_policy_id            = aws_cloudfront_cache_policy.this[ordered_cache_behavior.value].id
      response_headers_policy_id = aws_cloudfront_response_headers_policy.this.id
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = !local.has_custom_domain
    acm_certificate_arn            = local.has_custom_domain ? var.acm_certificate_arn : null
    ssl_support_method             = local.has_custom_domain ? "sni-only" : null
    minimum_protocol_version       = local.has_custom_domain ? "TLSv1.2_2021" : null
  }
}
