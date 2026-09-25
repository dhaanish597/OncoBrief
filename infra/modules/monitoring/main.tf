variable "name_prefix" { type = string }
variable "function_names" {
  type    = map(string)
  default = {}
}
variable "document_dlq_name" { type = string }
variable "ocr_dlq_name" { type = string }

# A non-empty dead-letter queue is the single most important operational signal
# in this pipeline: it means a document is stuck and a human should look.
resource "aws_cloudwatch_metric_alarm" "document_dlq" {
  alarm_name          = "${var.name_prefix}-document-dlq-not-empty"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "Documents failed ingestion and reached the DLQ."

  dimensions = {
    QueueName = var.document_dlq_name
  }
}

resource "aws_cloudwatch_metric_alarm" "ocr_dlq" {
  alarm_name          = "${var.name_prefix}-ocr-dlq-not-empty"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "OCR results failed processing and reached the DLQ."

  dimensions = {
    QueueName = var.ocr_dlq_name
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = var.function_names

  alarm_name          = "${var.name_prefix}-${each.key}-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_description   = "Worker function ${each.value} reported errors."

  dimensions = {
    FunctionName = each.value
  }
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.name_prefix}-pipeline"
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "DLQ depth"
          region = "ap-south-1"
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.document_dlq_name],
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.ocr_dlq_name],
          ]
        }
      },
      {
        type   = "log"
        width  = 12
        height = 6
        properties = {
          title  = "Worker errors (structured)"
          region = "ap-south-1"
          query  = "fields @timestamp, correlation_id, document_id, stage, status, error_code | filter level = 'error' | sort @timestamp desc"
        }
      },
    ]
  })
}
