terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
  # Remote state with native S3 locking (`use_lockfile`, Terraform >= 1.10), so
  # no DynamoDB table is required. The bucket is created by infra/bootstrap.
  # State is encrypted, versioned and never committed.
  backend "s3" {
    bucket       = "oncobrief-tfstate-375546530800"
    key          = "oncobrief/dev/terraform.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = var.tags
  }
}
