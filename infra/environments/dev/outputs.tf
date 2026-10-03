output "bucket_name" {
  value = module.s3.bucket_name
}

output "document_queue_url" {
  value = module.sqs.document_queue_url
}

output "ocr_queue_url" {
  value = module.sqs.ocr_queue_url
}

output "document_dlq_name" {
  value = module.sqs.document_dlq_name
}

output "ocr_dlq_name" {
  value = module.sqs.ocr_dlq_name
}

output "database_endpoint" {
  value = module.rds.endpoint
}

output "database_secret_arn" {
  value = module.rds.master_secret_arn
}

output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}

output "cognito_client_id" {
  value = module.cognito.client_id
}

output "cognito_issuer" {
  value = module.cognito.issuer
}

output "api_endpoint" {
  value = module.api_gateway.api_endpoint
}

output "lambda_functions" {
  value = module.lambda.function_names
}

output "kms_key_arn" {
  value = aws_kms_key.main.arn
}

output "web_url" {
  value       = module.web.web_url
  description = "Public HTTPS URL of the OncoBrief web application (CloudFront)."
}

output "web_cloudfront_domain" {
  value = module.web.cloudfront_domain_name
}

output "web_alb_dns_name" {
  value = module.web.alb_dns_name
}

output "web_ecr_repository_url" {
  value = module.web.ecr_repository_url
}
