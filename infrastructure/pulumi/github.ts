// ── Branch Protection ───────────────────────────────────────────────
// Managed via GitHub UI / gh CLI — the @pulumi/github provider hangs
// on both create and import for BranchProtection resources.
// Desired config is documented here for reference:
//
//   pattern: main
//   requiredPullRequestReviews: 1 approval, dismiss stale
//   requiredStatusChecks: strict, contexts: [Prepare, Dockerfile Lint,
//     Container Security Scan, Lint, Typecheck, Architecture Audit,
//     Build, Test (Node 20), Test (Node 22), Validate Migrations]
//   enforceAdmins: true
//   requiredLinearHistory: true
//   allowsForcePushes: false
//   allowsDeletions: false
