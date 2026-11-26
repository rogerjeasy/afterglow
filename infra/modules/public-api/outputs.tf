output "api_url" {
  description = "Base URL of the public API (no secret)."
  value       = aws_apigatewayv2_api.this.api_endpoint
}

output "function_arn" {
  description = "ARN of the public function (the console invokes it to push advisories)."
  value       = aws_lambda_function.public.arn
}
