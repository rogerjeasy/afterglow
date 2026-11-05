output "distribution_id" {
  description = "CloudFront distribution ID."
  value       = aws_cloudfront_distribution.this.id
}

output "distribution_arn" {
  description = "CloudFront distribution ARN, for the bucket policy."
  value       = aws_cloudfront_distribution.this.arn
}

output "domain_name" {
  description = "The distribution's cloudfront.net domain."
  value       = aws_cloudfront_distribution.this.domain_name
}
