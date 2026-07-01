#!/usr/bin/env bash
#
# Live-site availability sweep for the scheduled deep audit (audit-sweep.yml).
#
# Runs in GitHub Actions, where outbound egress AND the AUDIT_TOKEN secret both
# exist. The claude.ai remote environment cannot do this — its agent proxy
# denies the outbound CONNECT tunnel to the live site (curl exit 56 / HTTP 000),
# so a cloud RemoteTrigger can never audit production. This script is the
# reliable execution path.
#
# It curls each production surface (with the Cloudflare-bypass token) and files
# deduped `audit` issues for anything down or erroring. Lighthouse *scores* are
# tracked separately by .github/workflows/lighthouse.yml (static builds).
#
# Required env:
#   AUDIT_TOKEN  Cloudflare WAF bypass token (X-Audit-Token header)
#   GH_TOKEN     GitHub token with issues:write (for `gh issue`)
# Optional env:
#   MAX_ISSUES   Cap on new issues filed per run (default 5)
#
set -uo pipefail

UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
MAX_ISSUES="${MAX_ISSUES:-5}"
created=0

# name|url — top-level production surfaces (mirrors .audit-state/inventory.json)
SURFACES=(
  "marketing|https://mattbutlerengineering.com/"
  "hospitality|https://mattbutlerengineering.com/hospitality"
  "rialto|https://mattbutlerengineering.com/rialto"
  "gen|https://mattbutlerengineering.com/gen"
)

# create_issue <title> <search-phrase> <body> <label>...
# Dedups against open `audit` issues via the search phrase and honours MAX_ISSUES.
create_issue() {
  local title="$1" search="$2" body="$3"; shift 3
  if [ "$created" -ge "$MAX_ISSUES" ]; then
    echo "::notice::MAX_ISSUES ($MAX_ISSUES) reached — skipping: $title"
    return
  fi
  local existing
  existing=$(gh issue list --label audit --state open --search "$search" --json number --jq 'length' 2>/dev/null || echo 0)
  if [ "${existing:-0}" -gt 0 ]; then
    echo "::notice::Duplicate open audit issue exists — skipping: $title"
    return
  fi
  local label_args=()
  local l
  for l in "$@"; do label_args+=(--label "$l"); done
  if gh issue create --title "$title" --body "$body" "${label_args[@]}" >/dev/null 2>&1; then
    created=$((created + 1))
    echo "::notice::Filed audit issue: $title"
  else
    echo "::warning::Failed to file audit issue: $title"
  fi
}

total=0
down=0
declare -a DOWN_ENTRIES

for entry in "${SURFACES[@]}"; do
  name="${entry%%|*}"
  url="${entry#*|}"
  total=$((total + 1))
  # -L follows the trailing-slash 301s so we score the final rendered response.
  metrics=$(curl -o /dev/null -sS -L -m 45 -w '%{http_code} %{time_total}' \
    -A "$UA" -H "X-Audit-Token: ${AUDIT_TOKEN}" "$url" 2>/dev/null || echo "000 0")
  code="${metrics%% *}"
  ttime="${metrics##* }"
  printf 'SWEEP %-12s %-4s %ss %s\n' "$name" "$code" "$ttime" "$url"
  if ! [[ "$code" =~ ^[23] ]]; then
    down=$((down + 1))
    DOWN_ENTRIES+=("$name|$url|$code")
  fi
done

echo "::notice::Availability sweep complete — $((total - down))/$total surfaces healthy."

# Majority down → single infra issue and stop (matches /site-audit sweep policy).
if [ "$total" -gt 0 ] && [ "$down" -gt $((total / 2)) ]; then
  create_issue \
    "[Audit] Infrastructure: Site unreachable" \
    "Infrastructure: Site unreachable" \
    "$(printf 'Availability sweep found %d of %d production surfaces down or erroring.\n\nMost of the site is unreachable — likely a deploy, DNS, or CDN outage rather than a per-surface bug.\n\n### Surfaces\n%s\n\n_Filed by scheduled deep audit (.github/workflows/audit-sweep.yml)._' \
      "$down" "$total" "$(printf '%s\n' "${DOWN_ENTRIES[@]}" | sed 's/^/- /')")" \
    audit ready ci-fix
  exit 0
fi

# Otherwise one issue per down surface.
for dl in "${DOWN_ENTRIES[@]}"; do
  name="${dl%%|*}"
  rest="${dl#*|}"
  url="${rest%|*}"
  code="${rest##*|}"
  create_issue \
    "[Audit] Infrastructure: ${name} returned ${code}" \
    "Infrastructure: ${name} returned" \
    "$(printf 'The **%s** surface returned HTTP \`%s\` during the scheduled availability sweep.\n\n- URL: %s\n- Status: %s\n\nExpected a 2xx/3xx response. Investigate the deploy/CDN for this surface.\n\n_Filed by scheduled deep audit (.github/workflows/audit-sweep.yml)._' \
      "$name" "$code" "$url" "$code")" \
    audit ready ci-fix
done

echo "::notice::Deep audit finished — $created issue(s) filed this run."
