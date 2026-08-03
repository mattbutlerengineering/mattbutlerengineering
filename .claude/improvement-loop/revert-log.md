# Revert log

Human-readable revert history, appended by
`.github/workflows/revert-rca-detection.yml` when an AI-authored PR is reverted.

The workflow has always run `git add .claude/improvement-loop/`, but nothing
re-included this file, so every append was silently discarded (#3645). It is now
declared durable in `scripts/metrics-store.mjs` (`DURABLE_OUTSIDE`) and negated
by the generated `.gitignore` block.
