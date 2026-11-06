terraform {
  required_version = ">= 1.15.0"
  required_providers {
    aws    = { source = "hashicorp/aws", version = ">= 6.23, < 7.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  backend "s3" {
    bucket       = "oncobrief-tfstate-375546530800"
    key          = "oncobrief/hackathon/terraform.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
}
provider "aws" {
  allowed_account_ids = ["375546530800"]
  region              = "ap-south-1"
  default_tags {
    tags = { Project = "oncobrief-hackathon", Environment = "hackathon", ManagedBy = "terraform" }
  }
}
