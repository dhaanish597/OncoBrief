variable "name_prefix" { type = string }
variable "bucket_arn" { type = string }
variable "document_queue_arn" { type = string }
variable "ocr_queue_arn" { type = string }
variable "textract_topic_arn" { type = string }
variable "db_secret_arn" {
  type    = string
  default = null
}
variable "kms_key_arn" {
  type        = string
  default     = null
  description = "CMK used for SSE-KMS on the documents bucket. Required so the worker can write/read encrypted objects."
}
variable "bedrock_model_arn_pattern" {
  type        = string
  default     = "arn:aws:bedrock:*::foundation-model/*"
  description = "ARN pattern for the Bedrock models the worker may invoke. Least privilege: narrow to the configured model."
}

# --- Lambda execution role --------------------------------------------------
data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.name_prefix}-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

data "aws_iam_policy_document" "lambda_inline" {
  statement {
    sid    = "Queues"
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:ChangeMessageVisibility",
      "sqs:SendMessage",
    ]
    resources = [var.document_queue_arn, var.ocr_queue_arn, "${var.document_queue_arn}*", "${var.ocr_queue_arn}*"]
  }

  statement {
    sid       = "DocumentsReadWrite"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:GetObjectVersion", "s3:HeadObject"]
    resources = ["${var.bucket_arn}/*"]
  }

  statement {
    sid       = "DocumentsList"
    effect    = "Allow"
    actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [var.bucket_arn]
  }

  statement {
    sid    = "Textract"
    effect = "Allow"
    actions = [
      "textract:StartDocumentAnalysis",
      "textract:GetDocumentAnalysis",
      "textract:StartDocumentTextDetection",
      "textract:GetDocumentTextDetection",
    ]
    resources = ["*"]
  }

  statement {
    sid     = "Bedrock"
    effect  = "Allow"
    actions = ["bedrock:InvokeModel"]
    resources = [
      var.bedrock_model_arn_pattern,
      # Cross-region inference profiles. The APAC profile keeps routing within
      # APAC; see docs/aws-setup.md for the data-residency note.
      "arn:aws:bedrock:*:*:inference-profile/*",
    ]
  }

  statement {
    sid       = "Notifications"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [var.textract_topic_arn]
  }

  dynamic "statement" {
    for_each = var.db_secret_arn == null ? [] : [1]
    content {
      sid       = "DbSecret"
      effect    = "Allow"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = [var.db_secret_arn]
    }
  }

  dynamic "statement" {
    for_each = var.kms_key_arn == null ? [] : [1]
    content {
      sid       = "KmsForS3"
      effect    = "Allow"
      actions   = ["kms:GenerateDataKey", "kms:Decrypt", "kms:DescribeKey"]
      resources = [var.kms_key_arn]
    }
  }
}

resource "aws_iam_role_policy" "lambda_inline" {
  name   = "${var.name_prefix}-lambda-inline"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_inline.json
}

# --- S3 -> SQS notification role -------------------------------------------
data "aws_iam_policy_document" "s3_events" {
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [var.document_queue_arn]
  }
}

resource "aws_iam_role" "s3_events" {
  name = "${var.name_prefix}-s3-events"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "s3.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "s3_events" {
  name   = "${var.name_prefix}-s3-events"
  role   = aws_iam_role.s3_events.id
  policy = data.aws_iam_policy_document.s3_events.json
}

# --- Textract -> SNS role ---------------------------------------------------
resource "aws_iam_role" "textract_sns" {
  name = "${var.name_prefix}-textract-sns"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "textract.amazonaws.com" }
    }]
  })
}

data "aws_iam_policy_document" "textract_sns" {
  statement {
    actions   = ["sns:Publish"]
    resources = [var.textract_topic_arn]
  }
}

resource "aws_iam_role_policy" "textract_sns" {
  name   = "${var.name_prefix}-textract-sns"
  role   = aws_iam_role.textract_sns.id
  policy = data.aws_iam_policy_document.textract_sns.json
}

output "lambda_role_arn" { value = aws_iam_role.lambda.arn }
output "s3_events_role_arn" { value = aws_iam_role.s3_events.arn }
output "textract_sns_role_arn" { value = aws_iam_role.textract_sns.arn }
