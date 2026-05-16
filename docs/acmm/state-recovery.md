# ACMM State Recovery

## Backup Location

Weekly snapshots are stored in `.claude/acmm/backups/` by the `acmm-state-backup` workflow.

## Recovery Steps

1. **Identify the last good backup:**
   ```bash
   ls -la .claude/acmm/backups/state-*.json
   ```

2. **Restore state:**
   ```bash
   cp .claude/acmm/backups/state-YYYY-MM-DD.json .claude/acmm/state.json
   ```

3. **Re-run the audit to regenerate the report:**
   ```bash
   node plugins/acmm/scripts/audit.js
   ```

4. **Verify restoration:**
   ```bash
   cat .claude/acmm/state.json | python3 -m json.tool | head -5
   ```

## What's Backed Up

- `state.json` — Full ACMM computation state, level history, detected criteria
- `report.md` — Human-readable scorecard

## Retention

Last 12 weekly backups are kept (approximately 3 months of history).
