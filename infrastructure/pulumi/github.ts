import * as github from "@pulumi/github";

// ── Branch Protection ───────────────────────────────────────────────
// Codifies the branch protection rules for the main branch.
// GitHub provider authenticates via GITHUB_TOKEN env var.

const REPO = "mattbutlerengineering";

// Status check contexts must match the `name:` field of each CI job
// defined in .github/workflows/ci.yml.
const REQUIRED_STATUS_CHECKS = [
  "Prepare",
  "Dockerfile Lint",
  "Container Security Scan",
  "Lint",
  "Typecheck",
  "Architecture Audit",
  "Build",
  "Test (Node 20)",
  "Test (Node 22)",
  "Validate Migrations",
] as const;

const mainBranchProtection = new github.BranchProtection(
  "main-branch-protection",
  {
    repositoryId: REPO,
    pattern: "main",
    requiredPullRequestReviews: [
      {
        requiredApprovingReviewCount: 1,
        dismissStaleReviews: true,
      },
    ],
    requiredStatusChecks: [
      {
        strict: true,
        contexts: [...REQUIRED_STATUS_CHECKS],
      },
    ],
    enforceAdmins: true,
    requiredLinearHistory: true,
    allowsForcePushes: false,
    allowsDeletions: false,
  },
  { import: "mattbutlerengineering:main" }
);

// ── Exports ─────────────────────────────────────────────────────────
export const branchProtectionId = mainBranchProtection.id;
