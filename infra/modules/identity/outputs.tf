data "aws_region" "current" {}

output "user_pool_id" {
  description = "Cognito user pool ID."
  value       = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  description = "Cognito user pool ARN."
  value       = aws_cognito_user_pool.this.arn
}

output "app_client_id" {
  description = "Public app client ID (not a secret)."
  value       = aws_cognito_user_pool_client.app.id
}

output "issuer" {
  description = "Token issuer URL, for API Gateway JWT authorizers."
  value       = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
}
