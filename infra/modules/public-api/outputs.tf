output "api_url" {
  description = "Base URL of the public API (no secret)."
  value       = aws_apigatewayv2_api.this.api_endpoint
}
