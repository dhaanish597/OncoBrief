data "aws_caller_identity" "current" {}

resource "aws_kms_key" "main" {
  description             = "${var.name_prefix} document and secret encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true
}

resource "aws_kms_alias" "main" {
  name          = "alias/${var.name_prefix}"
  target_key_id = aws_kms_key.main.key_id
}

module "vpc" {
  source = "../../modules/vpc"

  name_prefix        = var.name_prefix
  vpc_cidr           = var.vpc_cidr
  azs                = var.azs
  enable_nat_gateway = var.enable_nat_gateway
}

module "s3" {
  source = "../../modules/s3"

  bucket_name   = var.bucket_name
  kms_key_arn   = aws_kms_key.main.arn
  force_destroy = true
}

module "sqs" {
  source = "../../modules/sqs"

  name_prefix = var.name_prefix
}

# One security group for the worker Lambdas. They initiate all connections
# (RDS, AWS APIs) so there is no inbound rule.
resource "aws_security_group" "lambda" {
  name        = "${var.name_prefix}-lambda"
  description = "Worker Lambda egress."
  vpc_id      = module.vpc.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

module "iam" {
  source = "../../modules/iam"

  name_prefix               = var.name_prefix
  bucket_arn                = module.s3.bucket_arn
  document_queue_arn        = module.sqs.document_queue_arn
  ocr_queue_arn             = module.sqs.ocr_queue_arn
  textract_topic_arn        = module.sqs.textract_topic_arn
  db_secret_arn             = module.rds.master_secret_arn
  kms_key_arn               = aws_kms_key.main.arn
  bedrock_model_arn_pattern = "arn:aws:bedrock:*::foundation-model/*"
}

module "rds" {
  source = "../../modules/rds"

  name_prefix                = var.name_prefix
  vpc_id                     = module.vpc.vpc_id
  subnet_ids                 = module.vpc.private_subnet_ids
  allowed_security_group_ids = [aws_security_group.lambda.id]
  instance_class             = var.db_instance_class
  engine_version             = var.db_engine_version
  db_name                    = var.db_name
  username                   = var.db_username
}

module "cognito" {
  source = "../../modules/cognito"

  name_prefix   = var.name_prefix
  domain_prefix = var.cognito_domain_prefix
}

module "lambda" {
  source = "../../modules/lambda"

  name_prefix        = var.name_prefix
  source_dir         = "${path.root}/../../build/worker"
  package_path       = "${path.root}/../../build/worker.zip"
  role_arn           = module.iam.lambda_role_arn
  subnet_ids         = module.vpc.private_subnet_ids
  security_group_ids = [aws_security_group.lambda.id]
  document_queue_arn = module.sqs.document_queue_arn
  ocr_queue_arn      = module.sqs.ocr_queue_arn

  environment = {
    QUEUE_DRIVER   = "sqs"
    STORAGE_DRIVER = "s3"
    # AWS_REGION is provided by the Lambda runtime and is a reserved key; it is
    # deliberately not set here.
    AWS_ACCOUNT_ID                  = data.aws_caller_identity.current.account_id
    S3_DOCUMENTS_BUCKET             = module.s3.bucket_name
    STORAGE_S3_BUCKET               = module.s3.bucket_name
    STORAGE_S3_REGION               = var.region
    SQS_DOCUMENT_QUEUE              = module.sqs.document_queue_name
    SQS_OCR_RESULT_QUEUE            = module.sqs.ocr_queue_name
    SQS_DOCUMENT_QUEUE_URL          = module.sqs.document_queue_url
    SQS_OCR_RESULT_QUEUE_URL        = module.sqs.ocr_queue_url
    EXTRACTION_DRIVER               = var.extraction_driver
    BEDROCK_MODEL_ID                = var.bedrock_model_id
    TEXTRACT_NOTIFICATION_TOPIC_ARN = module.sqs.textract_topic_arn
    TEXTRACT_NOTIFICATION_ROLE_ARN  = module.iam.textract_sns_role_arn
    # Runtime uses the non-owner app role: RLS applies, append-only grants apply.
    # The password is the prototype's documented dev credential (see docs/security.md).
    DATABASE_URL  = "postgres://oncobrief_app:oncobrief_app@${module.rds.endpoint}:${module.rds.port}/${var.db_name}?sslmode=require"
    DB_SECRET_ARN = module.rds.master_secret_arn
    DB_HOST       = module.rds.endpoint
    DB_PORT       = tostring(module.rds.port)
    DB_NAME       = var.db_name
  }
}

module "api_gateway" {
  source = "../../modules/api_gateway"

  name_prefix      = var.name_prefix
  cognito_issuer   = module.cognito.issuer
  cognito_audience = module.cognito.client_id
  backend_uri      = var.backend_uri
}

module "monitoring" {
  source = "../../modules/monitoring"

  name_prefix       = var.name_prefix
  function_names    = merge(module.lambda.function_names, { admin = module.lambda.admin_function_name })
  document_dlq_name = module.sqs.document_dlq_name
  ocr_dlq_name      = module.sqs.ocr_dlq_name
}

# S3 ObjectCreated → document ingest SQS queue. Depends on the queue policy that
# grants s3.amazonaws.com permission to send.
resource "aws_s3_bucket_notification" "documents" {
  bucket = module.s3.bucket_id

  queue {
    queue_arn     = module.sqs.document_queue_arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "org/"
  }

  depends_on = [module.sqs, module.lambda]
}
