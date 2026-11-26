output "api_url" {
  description = "Base URL of the vault API (no secret)."
  value       = aws_apigatewayv2_api.this.api_endpoint
}

output "function_name" {
  description = "The vault function's name."
  value       = aws_lambda_function.vault.function_name
}
