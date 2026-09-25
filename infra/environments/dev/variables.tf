variable "region" {
  type        = string
  default     = "ap-south-1"
  description = "AWS region. Bedrock model availability differs per region; the model id is a separate variable."
}

variable "name_prefix" {
  type        = string
  default     = "oncobrief-dev"
  description = "Prefix applied to every resource name."
}

variable "tags" {
  type = map(string)
  default = {
    Project     = "oncobrief"
    Environment = "dev"
    ManagedBy   = "terraform"
  }
}

variable "bucket_name" {
  type        = string
  default     = "oncobrief-documents-dev"
  description = "S3 bucket for document blobs. Must be globally unique."
}

variable "vpc_cidr" {
  type    = string
  default = "10.60.0.0/16"
}

variable "azs" {
  type    = list(string)
  default = ["ap-south-1a", "ap-south-1b"]
}

variable "enable_nat_gateway" {
  type        = bool
  default     = true
  description = "A single NAT gateway lets in-VPC Lambda reach S3/SQS/Textract/Bedrock. Disable and use VPC endpoints to cut cost."
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_engine_version" {
  type    = string
  default = "16.14"
}

variable "db_name" {
  type    = string
  default = "oncobrief"
}

variable "db_username" {
  type      = string
  default   = "oncobrief_migrator"
  sensitive = true
}

variable "bedrock_model_id" {
  type        = string
  default     = ""
  description = "Bedrock model id. Empty disables Bedrock extraction (worker falls back to rule-based). Never hard-code a model that may not exist in the region."
}

variable "extraction_driver" {
  type    = string
  default = "rule"
  validation {
    condition     = contains(["rule", "bedrock"], var.extraction_driver)
    error_message = "extraction_driver must be rule or bedrock."
  }
}

variable "backend_uri" {
  type        = string
  default     = ""
  description = "Backend origin API Gateway proxies to (the Next.js deployment). Empty creates the gateway without an integration target."
}

variable "cognito_domain_prefix" {
  type    = string
  default = ""
}
