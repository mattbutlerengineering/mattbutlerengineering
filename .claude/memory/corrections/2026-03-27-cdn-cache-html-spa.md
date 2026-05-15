---
date: 2026-03-27
session: deploy-debug
trigger: Users saw blank pages after deploys because CDN cached stale HTML responses
correction: Migrated static sites from CF Pages to Workers with Service Bindings, bypassing CDN entirely
root_cause: CDN cached HTML subrequest responses. After deploy, stale HTML pointed to old JS bundles that no longer existed.
prevention: Service Bindings make internal calls in-process. CDN caching of HTML is no longer architecturally possible.
---
