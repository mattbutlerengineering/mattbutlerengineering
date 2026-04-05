# Auto-Generated Performance Optimization: discovery

**Source**: mbe audit-perf
**Detected Issue**: High Research Turns detected (Avg: 10.0)

## Objective
Run 'mbe pack <directory>' on frequently touched directories to compress context.

## Implementation Steps
1. Analyze the last 5 sessions in `docs/logs/agent-perf.jsonl` to find specific files.
2. Apply the recommended optimization.
3. Verify improvement by running `mbe stats`.
