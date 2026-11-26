terraform {
  backend "s3" {
    bucket       = "afterglow-tfstate-503002144480"
    key          = "bootstrap/terraform.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    kms_key_id   = "alias/afterglow-account"
    use_lockfile = true
  }
}
