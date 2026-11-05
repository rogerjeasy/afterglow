terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Bootstrap starts on LOCAL state because the bucket that will hold remote
  # state does not exist yet. After the first apply, move it into that bucket:
  # see backend.tf.example and infra/README.md, step 3.
}

provider "aws" {
  region = var.region

  # Refuse to run against any other account.
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Project    = "afterglow"
      ManagedBy  = "terraform"
      Stack      = "bootstrap"
      Repository = "github.com/rogerjeasy/afterglow"
    }
  }
}
