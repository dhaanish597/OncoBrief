# ===========================================================================
# Terraform state backend bootstrap (ADR 0015).
#
# The dev environment stores its state in S3 with native S3 locking
# (`use_lockfile = true`, Terraform >= 1.10 — no DynamoDB table needed). The
# bucket must exist before the backend can use it, so it is bootstrapped here.
#
# This bootstrap uses LOCAL state — a deliberate, documented chicken-and-egg
# exception. It creates one bucket and nothing else, so the local state file is
# trivial and is git-ignored. Re-running `terraform apply` is idempotent.
#
#   cd infra/bootstrap
#   terraform init
#   terraform apply -var="state_bucket=oncobrief-tfstate-<account-id>"
#
# Then initialise the dev environment (see docs/aws-setup.md).
# ===========================================================================

terraform {
  required_version = ">= 1.10.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  type    = string
  default = "ap-south-1"
}

variable "state_bucket" {
  type        = string
  description = "Globally unique S3 bucket name for Terraform state."
}

variable "tags" {
  type = map(string)
  default = {
    Project   = "oncobrief"
    Purpose   = "terraform-state"
    ManagedBy = "terraform"
  }
}

resource "aws_s3_bucket" "state" {
  bucket = var.state_bucket
  tags   = var.tags
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Reject any non-TLS request to the state bucket.
data "aws_iam_policy_document" "state_tls" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = data.aws_iam_policy_document.state_tls.json
}

output "state_bucket" {
  value = aws_s3_bucket.state.bucket
}

output "backend_config" {
  value = <<-EOT
    backend "s3" {
      bucket       = "${aws_s3_bucket.state.bucket}"
      key          = "oncobrief/dev/terraform.tfstate"
      region       = "${var.region}"
      encrypt      = true
      use_lockfile = true
    }
  EOT
}
