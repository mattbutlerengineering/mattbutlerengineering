---
paths:
  - "infrastructure/pulumi/**"
  - ".github/workflows/pulumi*"
---

# Gotchas — Pulumi / R2 state backend

Path-scoped sibling of [gotchas.md](./gotchas.md#pulumi--r2-state-backend). Same format rules apply.

- **Keep the Pulumi CLI pinned to 3.253.0 in `pulumi-up.yml`, including every `pulumi/actions` step's `pulumi-version:`** (its default `^3` floats). The 2026-08-11 runner-image bump took the CLI 3.253.0 → 3.256.0, whose S3 layer sends checksums Cloudflare R2 rejects (`InvalidDigest` on the first state write, `.pulumi/meta.yaml` during `pulumi login`) — #4117/#4118. Pinned by `scripts/__tests__/pulumi-cli-pin.test.mjs`. The pin is a holding action: the gap to `@pulumi/pulumi` grows with every SDK bump.
- **`AWS_REQUEST_CHECKSUM_CALCULATION` / `AWS_RESPONSE_CHECKSUM_VALIDATION=when_required` do NOT fix it** — refuted 2026-09-22 (run 35675673874, both arms failed identically). Don't retry them elsewhere. To test a new Pulumi minor: `gh workflow run pulumi-r2-checksum-validation.yml -f pulumi_version=<new>` and read the fix arm's `outcome`. The harness self-provisions a scratch bucket; `scripts/pulumi-r2-validation-guard.mjs`'s `assertScratchBucketSafe` refuses the production bucket. Only raise the pin after a dispatched run passes.
- pulumi/pulumi#23478 (`CopyObject`/`InvalidArgument`) is a different symptom from ours — don't assume its fix covers this.
- **Before adding a resource type of a provider not already used in `infrastructure/pulumi/*.ts`, confirm the CI credential holds the scopes it needs** — mock-provider tests can't prove authorization; #4924 403'd on its first real `pulumi up` and was reverted (RCA: `.claude/reflections/RCA-PR-4924.md`). No automated gate exists yet.
