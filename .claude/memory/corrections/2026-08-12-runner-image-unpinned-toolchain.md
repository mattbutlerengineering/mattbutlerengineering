---
date: 2026-08-12
session: pulumi-prod-deploy-outage
trigger: Production infrastructure deploys broke for hours with a zero-diff push — no repo change corresponded to the failure, and the first hypotheses all assumed our own code had regressed
correction: Treat "the CI runner image updated" as a first-class root-cause hypothesis whenever a deploy workflow breaks with no corresponding repo change; pin the tool explicitly and back the pin with a test that reads the real workflow file
root_cause: pulumi-up.yml shelled out to the `pulumi` binary preinstalled on the ubuntu24 runner image without a version pin. GitHub bumped the image (20260720.247 to 20260810.271) on its own schedule, taking the Pulumi CLI from 3.253.0 to 3.256.0, whose S3 blob layer sends upload checksums Cloudflare R2 rejects with InvalidDigest on the state lock-file PutObject.
prevention: Pin the tool to an explicit version in the workflow, install it explicitly rather than trusting PATH, and assert the pin is exact (not a floating range) in a test that parses the workflow file — scripts/__tests__/pulumi-cli-pin.test.mjs. Every pulumi/actions step needs the same pulumi-version, because its unpinned default of ^3 resolves to latest and reintroduces the float.
feeds_back_into: .claude/rules/gotchas.md#pulumi--r2-state-backend
---

## Summary

A deploy pipeline that shells out to a tool the runner image ships preinstalled inherits whatever version that image happens to carry today. GitHub updates runner images on its own schedule, with no changelog review from us and no correlation to anything in our tree — so a production deploy can start failing, or worse start behaving differently, on a push that changed nothing.

This generalises well beyond Pulumi. The same exposure exists for `terraform`, `aws`, `docker`, and any language toolchain installed via a system package manager. The fix pattern is always the same three parts: pin the version in the workflow, install it explicitly instead of trusting PATH, and add a test that reads the real workflow file and asserts the pin is present and exact. The test is the load-bearing part — a pin with nothing guarding it silently decays back to a float the next time someone edits the workflow.

The pin landed in PR #4118 as a deliberate holding action, not a permanent fix: it freezes the CLI while the `@pulumi/pulumi` Node SDK that `infrastructure/pulumi` actually imports keeps moving forward, so the gap only widens with every future SDK bump.
