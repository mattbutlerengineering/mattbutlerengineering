---
date: 2026-03-27
session: deploy-debug
trigger: Users saw blank pages after deploys because CDN cached stale HTML responses
correction: Migrated static sites from CF Pages to Workers with Service Bindings, bypassing CDN entirely
root_cause: CDN cached HTML subrequest responses. After deploy, stale HTML pointed to old JS bundles that no longer existed.
prevention: Service Bindings make internal calls in-process. CDN caching of HTML is no longer architecturally possible.
feeds_back_into: CLAUDE.md#manual-deployment, .claude/rules/gotchas.md
---

## Summary

Static sites must use Cloudflare Workers with Service Bindings rather than CF Pages to avoid CDN caching of HTML responses. After a deploy, stale cached HTML files reference JS bundle hashes that no longer exist, causing blank pages for users who receive the old HTML. Service Bindings bypass the CDN entirely by making internal in-process calls, which eliminates this failure mode structurally. The fix is architectural — not a cache-busting header tweak — and should be treated as a hard constraint for all static site deployments in this repo.
