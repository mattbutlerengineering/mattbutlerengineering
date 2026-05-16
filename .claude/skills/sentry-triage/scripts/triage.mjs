#!/usr/bin/env node
const SENTRY_TOKEN = process.env.SENTRY_ACCESS_TOKEN;
if (!SENTRY_TOKEN) {
  console.error("SENTRY_ACCESS_TOKEN not set");
  process.exit(1);
}
const GITHUB_TOKEN = process.env.GH_TOKEN || "";
const ORG_SLUG = "mattbutlerengineering";
const SEVERITY_THRESHOLD = 5;

async function sentryApi(endpoint) {
  const response = await fetch(`https://sentry.io/api/0${endpoint}`, {
    headers: { Authorization: `Bearer ${SENTRY_TOKEN}` },
  });
  if (!response.ok) throw new Error(`Sentry API error: ${response.status}`);
  return response.json();
}

async function ghApi(endpoint, options = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      ...options.headers,
    },
  });
  return response.json();
}

async function searchExistingIssues(query) {
  return ghApi(`/search/issues?q=${encodeURIComponent(query)}+is:issue+state:open`);
}

async function createIssue(title, body, labels) {
  return ghApi("/issues", { method: "POST", body: JSON.stringify({ title, body, labels }) });
}

async function triage() {
  console.log("Fetching Sentry projects...\n");
  const projects = await sentryApi(`/organizations/${ORG_SLUG}/projects/`);
  console.log(`Found ${projects.length} projects: ${projects.map((p) => p.slug).join(", ")}`);

  const allIssues = [];
  for (const project of projects) {
    const issues = await sentryApi(`/projects/${ORG_SLUG}/${project.slug}/issues/?statsPeriod=14d`);
    allIssues.push(...issues.map((i) => ({ ...i, project: project.slug })));
  }

  console.log(`\nTotal issues: ${allIssues.length}`);
  const filtered = allIssues.filter(
    (i) => (i.level === "error" || i.level === "fatal") && parseInt(i.count) >= SEVERITY_THRESHOLD
  );
  console.log(`Filtered (>${SEVERITY_THRESHOLD} events): ${filtered.length}\n`);

  if (filtered.length === 0) {
    console.log("No actionable issues found. System is healthy!");
    return { created: 0, skipped: 0, found: 0 };
  }

  let created = 0,
    skipped = 0;
  for (const issue of filtered.slice(0, 3)) {
    const title = issue.title.slice(0, 100);
    const existing = await searchExistingIssues(`sentry ${issue.id}`);
    if (existing.total_count > 0) {
      skipped++;
      continue;
    }
    const byTitle = await searchExistingIssues(title);
    if (byTitle.total_count > 0) {
      skipped++;
      continue;
    }

    const body = `## Sentry Production Error\n\n**Sentry Issue:** https://sentry.io/organizations/${ORG_SLUG}/issues/${issue.id}/\n**Project:** ${issue.project}\n**Level:** ${issue.level}\n**Events:** ${issue.count} in last 14 days\n**Affected Users:** ${issue.userCount || 0}\n\n## Acceptance Criteria\n\n- [ ] Error rate drops >50% after fix\n- [ ] Verified by learning-loop post-fix check\n\n_Detected by sentry-triage_`;

    const result = await createIssue(`fix(${issue.project}): ${title}`, body, [
      "ready",
      "sentry",
      "bug",
    ]);
    console.log(`Created issue #${result.number}`);
    created++;
  }
  return { created, skipped, found: filtered.length };
}

triage()
  .then((r) =>
    console.log(`\nTriage complete: ${r.created} created, ${r.skipped} skipped of ${r.found} found`)
  )
  .catch((e) => {
    console.error("Error:", e.message);
    process.exit(1);
  });
