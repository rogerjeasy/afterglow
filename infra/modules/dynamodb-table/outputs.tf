output "name" {
  description = "Table name."
  value       = aws_dynamodb_table.this.name
}

output "arn" {
  description = "Table ARN."
  value       = aws_dynamodb_table.this.arn
}

output "stream_arn" {
  description = "Change stream ARN, or null when the stream is off."
  value       = aws_dynamodb_table.this.stream_arn
}
