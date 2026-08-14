#!/usr/bin/env bash
set -euo pipefail

# run-pulumi-r2-validation-arm.sh — runs one arm of the #4119 Pulumi/R2
# checksum validation harness: log in to the (already-guarded) scratch R2
# bucket, init a throwaway stack, `up` + `refresh` a program with ZERO
# resources, then tear the stack back down. The point is exercising
# Pulumi's state read/lock/checkpoint write path against R2 (the same
# lock-file PutObject that produced InvalidDigest in #4117/#4118) — never
# to create real cloud infrastructure. This script never decides which
# bucket to target; the caller must have already run
# pulumi-r2-validation-guard.mjs check-bucket and passed the result in.
#
# Whether AWS_REQUEST_CHECKSUM_CALCULATION / AWS_RESPONSE_CHECKSUM_VALIDATION
# are set is entirely the CALLING JOB's decision (job-level `env:` in
# pulumi-r2-checksum-validation.yml) — this script is unaware of the
# distinction, which is exactly what makes it safe to reuse unmodified for
# both the "with fix" and "without fix" (control) arms.
#
# Usage: run-pulumi-r2-validation-arm.sh <arm-name> <backend-url> <work-dir>
# Required env (set by the caller): PULUMI_CONFIG_PASSPHRASE,
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION.
# Writes to $GITHUB_OUTPUT: arm=<arm-name>, outcome=pass|fail.

ARM_NAME="$1"
BACKEND_URL="$2"
WORK_DIR="$3"
STACK_NAME="${ARM_NAME}-${GITHUB_RUN_ID:-local}"

mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

cat > package.json <<'EOF'
{
  "name": "pulumi-r2-validation",
  "version": "0.0.0",
  "private": true,
  "main": "index.js",
  "dependencies": {
    "@pulumi/pulumi": "^3.256.0"
  }
}
EOF

cat > index.js <<'EOF'
"use strict";
// Zero resources, on purpose. This program exists only to exercise
// Pulumi's state read/lock/checkpoint write path against the R2 backend
// (#4119) - never to create real cloud infrastructure.
exports.validated = "pulumi-r2-checksum-validation";
EOF

cat > Pulumi.yaml <<'EOF'
name: pulumi-r2-validation
runtime: nodejs
description: >-
  Scratch, zero-resource program for #4119 - validates whether Pulumi CLI
  3.256.0+ can write state to this R2 bucket without InvalidDigest.
EOF

npm install --no-audit --no-fund

pulumi login "$BACKEND_URL"
pulumi stack init "$STACK_NAME"

outcome="pass"
if ! pulumi up --yes --skip-preview; then
  outcome="fail"
elif ! pulumi refresh --yes; then
  outcome="fail"
fi

# Best-effort cleanup regardless of outcome - never leave scratch-bucket
# state behind, but a cleanup failure doesn't change the measured outcome.
pulumi destroy --yes || true
pulumi stack rm --yes --force || true

{
  echo "arm=${ARM_NAME}"
  echo "outcome=${outcome}"
} >> "$GITHUB_OUTPUT"

if [ "$outcome" = "fail" ]; then
  exit 1
fi
