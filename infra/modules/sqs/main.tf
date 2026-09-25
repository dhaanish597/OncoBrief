variable "name_prefix" { type = string }
variable "max_receive_count" {
  type    = number
  default = 3
}
variable "visibility_timeout_seconds" {
  type    = number
  default = 300
}
variable "message_retention_seconds" {
  type    = number
  default = 1209600
}

locals {
  document_queue = "${var.name_prefix}-document-ingest"
  ocr_queue      = "${var.name_prefix}-ocr-result"
}

# --- document ingest queue + DLQ -------------------------------------------
resource "aws_sqs_queue" "document_dlq" {
  name                       = "${local.document_queue}-dlq"
  message_retention_seconds  = var.message_retention_seconds
  visibility_timeout_seconds = var.visibility_timeout_seconds
  sqs_managed_sse_enabled    = true
}

resource "aws_sqs_queue" "document" {
  name                       = local.document_queue
  visibility_timeout_seconds = var.visibility_timeout_seconds
  message_retention_seconds  = var.message_retention_seconds
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.document_dlq.arn
    maxReceiveCount     = var.max_receive_count
  })
}

# --- OCR result queue + DLQ -------------------------------------------------
resource "aws_sqs_queue" "ocr_dlq" {
  name                       = "${local.ocr_queue}-dlq"
  message_retention_seconds  = var.message_retention_seconds
  visibility_timeout_seconds = var.visibility_timeout_seconds
  sqs_managed_sse_enabled    = true
}

resource "aws_sqs_queue" "ocr" {
  name                       = local.ocr_queue
  visibility_timeout_seconds = var.visibility_timeout_seconds
  message_retention_seconds  = var.message_retention_seconds
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.ocr_dlq.arn
    maxReceiveCount     = var.max_receive_count
  })
}

# --- SNS topic for Textract completion -------------------------------------
resource "aws_sns_topic" "textract_completion" {
  name = "${var.name_prefix}-textract-completion"
}

resource "aws_sns_topic_subscription" "textract_to_ocr_queue" {
  topic_arn = aws_sns_topic.textract_completion.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.ocr.arn
}

# The OCR queue must accept publishes from SNS.
data "aws_iam_policy_document" "ocr_queue_policy" {
  statement {
    sid    = "AllowSNSPublish"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.ocr.arn]
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_sns_topic.textract_completion.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "ocr" {
  queue_url = aws_sqs_queue.ocr.id
  policy    = data.aws_iam_policy_document.ocr_queue_policy.json
}

# The document queue accepts S3 event notifications.
data "aws_iam_policy_document" "document_queue_policy" {
  statement {
    sid    = "AllowS3Notifications"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["s3.amazonaws.com"]
    }
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.document.arn]
  }
}

resource "aws_sqs_queue_policy" "document" {
  queue_url = aws_sqs_queue.document.id
  policy    = data.aws_iam_policy_document.document_queue_policy.json
}

output "document_queue_name" { value = aws_sqs_queue.document.name }
output "document_queue_arn" { value = aws_sqs_queue.document.arn }
output "document_queue_url" { value = aws_sqs_queue.document.id }
output "document_dlq_name" { value = aws_sqs_queue.document_dlq.name }
output "document_dlq_arn" { value = aws_sqs_queue.document_dlq.arn }
output "ocr_queue_name" { value = aws_sqs_queue.ocr.name }
output "ocr_queue_arn" { value = aws_sqs_queue.ocr.arn }
output "ocr_queue_url" { value = aws_sqs_queue.ocr.id }
output "ocr_dlq_name" { value = aws_sqs_queue.ocr_dlq.name }
output "ocr_dlq_arn" { value = aws_sqs_queue.ocr_dlq.arn }
output "textract_topic_arn" { value = aws_sns_topic.textract_completion.arn }
