variable "name_prefix" { type = string }
variable "source_dir" {
  type        = string
  description = "Directory containing the built Lambda artefacts (index.js, admin.js)."
}
variable "package_path" {
  type        = string
  description = "Path to the zipped deployment package produced by archive_file."
}
variable "role_arn" { type = string }
variable "subnet_ids" { type = list(string) }
variable "security_group_ids" { type = list(string) }
variable "document_queue_arn" { type = string }
variable "ocr_queue_arn" { type = string }
variable "environment" {
  type    = map(string)
  default = {}
}
variable "log_retention_days" {
  type    = number
  default = 30
}
variable "memory_size" {
  type    = number
  default = 512
}

# The bundle is produced by `pnpm worker:build`. Using archive_file keeps
# packaging deterministic and cross-platform (no shell `zip`) and gives a stable
# source_code_hash so a code change actually triggers a Lambda update.
data "archive_file" "worker" {
  type        = "zip"
  source_dir  = var.source_dir
  output_path = var.package_path
}

locals {
  functions = {
    document = {
      name        = "${var.name_prefix}-document-ingest"
      description = "Stage 1: S3 object → hash → Textract StartDocumentAnalysis."
      queue_arn   = var.document_queue_arn
      batch_size  = 1
      handler     = "index.documentIngestHandler"
    }
    ocr = {
      name        = "${var.name_prefix}-ocr-result"
      description = "Stage 2: Textract completion → normalise → evidence promotion."
      queue_arn   = var.ocr_queue_arn
      batch_size  = 10
      handler     = "index.ocrResultHandler"
    }
  }
}

resource "aws_cloudwatch_log_group" "lambda" {
  for_each          = local.functions
  name              = "/aws/lambda/${each.value.name}"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "admin" {
  name              = "/aws/lambda/${var.name_prefix}-admin"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "worker" {
  for_each = local.functions

  function_name = each.value.name
  description   = each.value.description
  role          = var.role_arn

  filename         = data.archive_file.worker.output_path
  source_code_hash = data.archive_file.worker.output_base64sha256
  handler          = each.value.handler
  runtime          = "nodejs20.x"
  timeout          = 300
  memory_size      = var.memory_size

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = var.security_group_ids
  }

  environment {
    variables = var.environment
  }

  depends_on = [aws_cloudwatch_log_group.lambda]
}

resource "aws_lambda_event_source_mapping" "worker" {
  for_each = local.functions

  event_source_arn        = each.value.queue_arn
  function_name           = aws_lambda_function.worker[each.key].arn
  batch_size              = each.value.batch_size
  enabled                 = true
  function_response_types = ["ReportBatchItemFailures"]
}

# Admin function: invoked manually (`aws lambda invoke`) to run migrations, seed
# the demo organization and drive/verify a real end-to-end run. No event source
# — it is never triggered automatically.
resource "aws_lambda_function" "admin" {
  function_name = "${var.name_prefix}-admin"
  description   = "In-VPC admin: migrate, seed-demo, e2e, evidence, probe."
  role          = var.role_arn

  filename         = data.archive_file.worker.output_path
  source_code_hash = data.archive_file.worker.output_base64sha256
  handler          = "admin.adminHandler"
  runtime          = "nodejs20.x"
  timeout          = 300
  memory_size      = var.memory_size

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = var.security_group_ids
  }

  environment {
    variables = var.environment
  }

  depends_on = [aws_cloudwatch_log_group.admin]
}

output "function_names" { value = { for k, v in aws_lambda_function.worker : k => v.function_name } }
output "function_arns" { value = { for k, v in aws_lambda_function.worker : k => v.arn } }
output "admin_function_name" { value = aws_lambda_function.admin.function_name }
output "log_group_names" { value = { for k, v in aws_cloudwatch_log_group.lambda : k => v.name } }
