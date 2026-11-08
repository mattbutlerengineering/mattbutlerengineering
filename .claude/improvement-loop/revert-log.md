# Revert log

Historical revert log. Its only writer, the `revert-rca-detection.yml` workflow,
was retired (it never filed an RCA); live RCAs come from `/revert-rca-loop`.

That workflow ran `git add .claude/improvement-loop/`, but nothing
re-included this file, so every append was silently discarded (#3645). It is now
declared durable in `scripts/metrics-store.mjs` (`DURABLE_OUTSIDE`) and negated
by the generated `.gitignore` block.
