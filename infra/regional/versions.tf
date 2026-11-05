terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Partial configuration: the bucket, key and region differ for every
  # environment and region, so they are supplied at init time:
  #
  #   terraform init -backend-config=envs/dev-eu-central-1.backend.hcl
  #
  # State locking uses S3's own lock file (use_lockfile), set in that file.
  backend "s3" {}
}

provider "aws" {
  region = var.region

  # A guard against applying to the wrong AWS account: Terraform refuses to run
  # unless the credentials belong to this account.
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Project     = "afterglow"
      Environment = var.environment
      Region      = var.region
      ManagedBy   = "terraform"
      Stack       = "regional"
      Repository  = "github.com/rogerjeasy/afterglow"
    }
  }
}
