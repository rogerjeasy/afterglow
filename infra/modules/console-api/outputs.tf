output "api_url" {
  description = "Base URL of the console API (no secret)."
  value       = aws_apigatewayv2_api.this.api_endpoint
}
