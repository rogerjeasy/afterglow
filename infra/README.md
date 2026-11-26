# Afterglow infrastructure (Terraform)

This directory creates and manages Afterglow's AWS resources. **You apply it; nothing here
applies itself.** There is no automation that can create, change or delete resources, by design
(`AGENTS.md`, architecture ADR-016).

Everything here is checked offline: `terraform validate`, plan-level tests against a mocked AWS
provider, deliberate-regression ("mutation") checks, and a Checkov scan (0 failed).

**Deployed 2026-11-26** to account 503002144480, `eu-central-1`, environment `dev`: bootstrap
(20 resources) and the regional stack (72), with deletion protection on. The founder approved
each plan before it was applied (`AGENTS.md`, scoped exception). A post-apply plan shows no drift.
The live check (two throwaway users, then deleted) is recorded in `.kiro/specs/cloud-accounts/tasks.md`.

## Layout

```
infra/
  bootstrap/        ONCE per AWS account. State bucket, audit trail, budget, account guards,
                    optional read-only GitHub role for `plan`.
  regional/         ONE per environment and region. Run it once for each of the five regions.
    envs/           *.tfvars.example and backend.hcl.example. Copy, fill in, keep out of git.
    tests/          Offline tests (mocked provider).
  modules/
    kms/            Customer-managed key with rotation.
    s3-bucket/      The hardened bucket every bucket is built from.
    dynamodb-table/ On-demand, encrypted, TTL, optional backup.
    identity/       Cognito user pool and app client (passkeys).
    edge/           CloudFront for the public data bucket.
    alerts/         Encrypted SNS topic with email subscribers.
```

## What gets created

**Once per account (`bootstrap`)**: 20 resources

| Resource | Why |
|---|---|
| S3 state bucket, KMS-encrypted, versioned, private | Remote Terraform state with S3-native locking |
| KMS key `alias/afterglow-account` | Encrypts state and audit logs |
| CloudTrail (all regions, log-file validation) + private log bucket | Who did what, tamper-evident |
| Account-level S3 public-access block | No bucket in this account can become public by mistake |
| IAM Access Analyzer | Flags anything shared outside the account (free) |
| AWS Budget, email alerts at 50/80/100% and forecast | Spend alarm. **An alert, not a cap** |
| *(optional)* GitHub OIDC provider + read-only role | CI can run `terraform plan`. Off by default |
| *(optional)* GuardDuty | Threat detection. Off by default (bills by usage) |

**Once per environment and region (`regional`)**: 58 resources

| Resource | Why |
|---|---|
| KMS key `alias/afterglow-<env>-<region>` | Encrypts that region's tables and private buckets |
| 7 DynamoDB tables (on-demand, encrypted) | `cell_state`, `schedule`, `adherence`, `device`, `roster_relay`, `formulary`, `vault` |
| S3 `data` (public by design, SSE-S3) + CloudFront | Tiles, snapshots, the client-policy document. Bucket stays private; only the CDN reads it |
| S3 `history`, `private` (KMS) and `logs` | Analytics history (5-year expiry), artefacts, access logs (30-day expiry) |
| Cognito user pool + web client | Optional server accounts with passkeys |
| Encrypted SNS alert topic + per-table throttling alarms | Operations alerts |

## Before you start

1. **An AWS account** and credentials on your machine with permission to create the resources
   above (an administrator in a throwaway or dev account is simplest). Use **SSO or short-lived
   credentials**; do not create long-lived access keys.
2. **Terraform 1.10 or newer** (tested with 1.16). `terraform version`
3. **Decide the passkey domain.** `webauthn_relying_party_id` is the domain passkeys are bound to.
   Passkeys registered on `afterglow-flax.vercel.app` stop working if you later move to your own
   domain. If you plan a custom domain, use it now.
4. **Opt-in regions.** `af-south-1` and `me-south-1` are *disabled by default*. Enable them in the
   console (Account, AWS Regions) and wait for them to finish enabling before applying there.
   Start with `eu-central-1`, which needs nothing.

## Step 1: bootstrap (once per account)

```bash
cd infra/bootstrap
cp terraform.tfvars.example terraform.tfvars       # fill in account id, your email, budget
terraform init
terraform plan -out=bootstrap.plan                 # read it: 20 resources to create
terraform apply bootstrap.plan
terraform output backend_config_hint               # you need this in step 2
```

Check your inbox: AWS Budgets sends nothing to confirm, but you can verify the budget in the
Billing console.

## Step 2: move bootstrap's own state into the bucket it just created

```bash
cp backend.tf.example backend.tf                   # replace <ACCOUNT_ID>
terraform init -migrate-state                      # answer yes
ls terraform.tfstate*                              # delete the local copies once the remote one is confirmed
```

Commit `backend.tf` (it holds a bucket name and a key, no secret).

## Step 3: a regional stack (once per environment and region)

```bash
cd infra/regional
cp envs/dev-eu-central-1.tfvars.example envs/dev-eu-central-1.tfvars     # edit
cp envs/backend.hcl.example envs/dev-eu-central-1.backend.hcl            # paste bootstrap's hint, set the key

terraform init -backend-config=envs/dev-eu-central-1.backend.hcl
terraform plan  -var-file=envs/dev-eu-central-1.tfvars -out=dev.plan
terraform apply dev.plan
terraform output
```

For another region or environment, copy the same two files with new names and a **different state
`key`** in the backend file, then `terraform init -reconfigure -backend-config=...`. Each region has
its own state and shares nothing with the others (data residency, ADR-004).

Email subscriptions to the alert topic stay *Pending* until each address clicks the confirmation
link AWS emails it.

## Wiring the web app

`terraform output accounts` gives the region, user pool ID, app client ID and token issuer. None of
them is a secret. They go in the app's environment (for Vercel: Project, Settings, Environment
Variables) when server accounts are built. `terraform output cdn_domain_name` is the host for tiles
and snapshots.

## Security model, in short

- **Nothing is public** except what CloudFront serves from the `data` bucket, and that is
  aggregated, k-anonymous or signed. The account-level block, the per-bucket block, owner-enforced
  ownership and TLS 1.2+ are all on.
- **Encryption everywhere**: customer-managed KMS key per region with rotation; SSE-S3 only for the
  public data bucket and the log bucket (S3 cannot deliver logs to a KMS bucket).
- **No cross-region replication**, anywhere. Residency is a property of the code, not a policy.
- **Wrong-account guard**: both stacks set `allowed_account_ids`. Credentials for any other account
  are refused.
- **Deletion protection** on tables and the user pool by default. `protect_resources = false` is for
  throwaway dev stacks only.
- **No apply role in CI.** The optional GitHub role is read-only (`ViewOnlyAccess` + `SecurityAudit`)
  and trusts only this repository's pull requests and `main`.

## Accounts and the vault: one rule you must not break

The `vault` table stores **ciphertext only**. The browser encrypts a person's data with a key that
only their passphrase can open; the server never sees that passphrase or the key (see
`.kiro/specs/accounts`). Cognito authenticates the *account*, which is a separate thing.

> The vault passphrase must never be sent to any server, and it must not be the same secret as the
> Cognito password. Cognito's password proof can be attacked offline by anyone who obtains it, and
> if the two were the same, that would also open the vault. Passkeys avoid the question entirely.

Authorisation for vault records, when the API exists, must take the account ID **from the verified
token (`sub`), never from the request**. Even then a bug would only expose ciphertext.

## Retention is two-part

DynamoDB TTL deletes expired items **in the background, typically within 48 hours** of expiry, not
at the instant. So:

1. TTL (this repo) makes the data go away.
2. **Readers must also ignore items whose `expiresAt` is in the past**, so an expired roster message
   or cell window is never served in the gap. This is a requirement on the service code.

Tables with a short retention promise (`cell_state`, `roster_relay`, `device`) have **no
point-in-time recovery**, because a backup would keep deleted items for up to 35 days. The
`vault` and `formulary` tables *do* have it: a lost vault cannot be recovered by anyone, and the
formulary is clinical data kept with its history. A deleted account's ciphertext can therefore linger
in the vault table's backup for up to 35 days. It is unreadable without the person's passphrase.

## Cost

Idle cost of one regional dev stack is a few dollars a month, dominated by two KMS keys ($1 each) and
alarms ($0.10 each). On-demand DynamoDB, S3, Cognito (Essentials, first 10,000 monthly active users
free), SNS and CloudFront (free tier) cost nothing while idle. These figures are estimates from
public pricing; **check the Billing console after the first day**.

The things that *do* bill while idle are deliberately **not** here:

| Not built yet | Why | When |
|---|---|---|
| Kinesis Data Streams | A stream bills per hour even with no traffic | With the `intake` service |
| Managed Service for Apache Flink | Bills per KPU-hour continuously | With the aggregation job (Lambda windows suffice for small regions first) |
| OpenSearch Serverless | Has a high monthly minimum | When lit-places search is built |
| API Gateway and Lambda | Free while idle but need service code that does not exist | With `services/*` |
| WAF | A fixed monthly charge per web ACL | `cdn_web_acl_arn`, for production |
| SES, custom domain, ACM | Need a domain you own | Before production accounts |
| `BusinessSite`, `Programme`, `Advisory` tables | Business and Beacon are later waves; schemas not defined | Wave 7 |
| A `cell_state` index "by region and time" | In a single-region table the region is constant, which makes a hot partition; the tile builder reads the change stream instead | If a real access path appears |

Set `table_max_write_units` and `table_max_read_units` as a brake against runaway clients.

## What went wrong on the first real apply

- **Cognito refused the app client**: refresh-token rotation cannot be combined with
  `ALLOW_REFRESH_TOKEN_AUTH`, and the app's SRP client refreshes through that flow. Rotation was
  dropped (the app keeps tokens in memory only; revocation stays on). 64 of 72 resources had been
  created; a re-plan created the remaining 8 and changed nothing else.

## The vault API

`modules/vault-api` puts API Gateway with a Cognito JWT authorizer in front of one function that
stores each account's encrypted vault record, keyed only by the verified `sub`
(`.kiro/specs/cloud-accounts`). Build its bundle before any plan:

```bash
pnpm --filter @afterglow/vault-service build      # writes services/vault/dist/index.mjs
```

`terraform output accounts` gives the values the app needs; they go in
`apps/mobile/src/cloud/config.json`, and the API and Cognito hosts in the CSP in `apps/mobile/vercel.json`.

## What could still go wrong on first apply

I could not run `plan` or `apply`, so these are the places most likely to need a fix. Each is small.

- **A permission error** from your own credentials, such as `kms:CreateGrant` or `cloudfront:*`.
- **CloudTrail and KMS ordering.** If CloudTrail reports an invalid KMS key or bucket policy, apply
  again; the second pass usually succeeds once the policies have propagated.
- **Cognito tier or feature availability** in your region. Passkeys and the Essentials tier are not in
  every region. If `plan` rejects `web_authn_configuration` or `sign_in_policy`, tell me the region.
- **An S3 bucket name already taken.** Names include your account ID, so this is unlikely.
- **Budget email.** The first AWS Budgets email can take a day.
- **The CI plan role** (`enable_github_ci`) may need one or two extra read actions. Add the specific
  action; do not widen to `ReadOnlyAccess`, which can read data.

## Day-to-day

```bash
terraform fmt -recursive infra          # formatting
cd infra/regional && terraform test     # offline tests, no credentials
```

CI (`.github/workflows/infra.yml`) runs format, validate, the tests and Checkov on every change under
`infra/`, with no credentials.

**Tearing down a dev stack:** set `protect_resources = false`, apply, then `terraform destroy`. Buckets
are not force-destroyed; empty them first. Never do this to production. `bootstrap` should outlive
everything else.
