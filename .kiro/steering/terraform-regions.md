---
inclusion: fileMatch
fileMatchPattern: 'infra/**'
---

# Terraform and regions

Read `infra/README.md` first. Architecture: `docs/afterglow-architecture.md` sections 8.1, 10.2, 11 and ADR-004, ADR-006, ADR-014, ADR-016.

## Never

- **Never run `terraform apply`, `terraform destroy`, `terraform import`, `terraform state` writes or `terraform force-unlock`.** Deploying is a human step. You may run `fmt`, `init -backend=false`, `validate`, `test` and `providers lock`.
- Never run `plan` against a real account, never use or ask for AWS credentials, and never put credentials, account IDs of real accounts, emails or ARNs in committed files. Real values live in git-ignored `*.tfvars` and `*.backend.hcl`.
- Never add cross-region replication, a global table, or any path by which per-device or per-account data leaves its region (ADR-004, `privacy-aggregation.md` rule 8).
- Never make a bucket public, loosen an S3 public-access block, or add a policy that grants `Principal: "*"` without a condition.
- Never attach an administrator or broad write policy to CI. CI is read-only and has no `apply` role.
- Never add a resource that bills while idle (Kinesis streams, Flink applications, OpenSearch Serverless, NAT gateways, WAF web ACLs) without saying so and getting agreement. Say what it costs per month.

## Always

- Build buckets with `modules/s3-bucket`, tables with `modules/dynamodb-table`, keys with `modules/kms`. Add a variable to the module rather than copy it.
- Encrypt with the regional customer-managed key. SSE-S3 only for public-by-design data served by CloudFront and for S3 access logs.
- Every retention promise is enforced by infrastructure (TTL or a lifecycle rule) **and** has a test. A table with a short retention promise has **no** point-in-time recovery.
- Add a table only with a spec entry and a privacy review (`privacy-aggregation.md`): the test `no_table_stores_anything_but_what_the_spec_names` fails until the list is updated deliberately.
- `allowed_account_ids` stays set on every provider.
- Pin the AWS provider to `~> 6.0`, commit `.terraform.lock.hcl` for the two roots, and run `terraform providers lock` for linux_amd64, linux_arm64, darwin_arm64 and darwin_amd64.

## Definition of done for an infra change

1. `terraform fmt -recursive infra` is clean.
2. `terraform validate` and `terraform test` pass in every directory you touched, and in `regional` and `bootstrap` if you touched a module.
3. A new security or privacy property has a test that **fails when you break it**. Prove it by making the break on purpose, then revert it.
4. Checkov reports 0 failed. A `# checkov:skip=ID:reason` needs a real reason, written next to the resource.
5. `infra/README.md` says what is new, what it costs idle, and how it can fail on first apply.

## Plan-time limits to remember

Values that depend on another resource (an ARN, an ID) are unknown at plan time. Terraform cannot use them in `count`/`for_each`, and a mocked-provider test cannot read them. Use plain booleans for toggles, derive names from inputs instead of outputs where a cycle would form, and test the plan-time constants (conditions, flags) rather than the assembled JSON.
