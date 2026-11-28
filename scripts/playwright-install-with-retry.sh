#!/usr/bin/env bash
# Install Playwright's Chromium and its system packages, retrying once with a
# refreshed apt index. A runner whose apt index cannot locate Playwright's font
# packages fails `--with-deps` with exit 100 before any test runs (#10091);
# other hosts in the same run install fine, so the failure is per-host and
# usually transient. Used by every Playwright install in e2e.yml.
set -uo pipefail

if npx playwright install --with-deps chromium; then
  exit 0
fi
echo "playwright install attempt 1 failed; refreshing the apt index and retrying..."
sleep 10
sudo apt-get update
if npx playwright install --with-deps chromium; then
  exit 0
fi
echo "::error::playwright install --with-deps chromium failed after 2 attempts (#10091)"
exit 1
