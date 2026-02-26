# One-Man Dev Team Playbook

A comprehensive, actionable playbook for solo developers using AI agents to ship like a team. Everything here is designed to be usable from day 1 — no vague advice, only checklists, decision trees, templates, and concrete steps.

---

## Table of Contents

1. [Week-by-Week Ramp-Up Plan](#week-by-week-ramp-up-plan)
2. [Decision Trees](#decision-trees)
3. [Copy-Paste Templates](#copy-paste-templates)
4. [Checklists](#checklists)
5. [Anti-Pattern Recognition Guide](#anti-pattern-recognition-guide)
6. [Further Reading](#further-reading)

---

## Week-by-Week Ramp-Up Plan

### Week 1: Foundation

**Goal:** Establish the minimum infrastructure for daily shipping.

- [ ] Create `TODO.md` in your project root ([template below](#c-todomd-template))
- [ ] Set up GitHub Actions deploy pipeline ([template below](#d-github-actions-workflow))
- [ ] Ship your first change today — even if it is a typo fix, dependency update, or README edit
- [ ] Pick ONE primary AI coding tool and commit to it for 30 days ([decision tree below](#decision-tree-3-which-ai-coding-tool))
- [ ] Create `CLAUDE.md` in your repo root ([template below](#b-claudemd-starter-template))
- [ ] Establish your commit message convention — use [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] Set up a basic pre-commit hook: at minimum, run your linter

**Ship target:** 5+ commits this week. They can be small. The habit matters more than the size.

---

### Week 2: First Agent

**Goal:** Introduce one AI agent into your workflow and start measuring.

- [ ] Add a code-reviewer agent ([template below](#code-reviewer-agent))
- [ ] Run the code-reviewer agent after every feature branch before merging
- [ ] Start tracking two metrics:
  - **Time-to-ship:** Time from "I started this feature" to "it is deployed in production"
  - **Code churn rate:** Lines changed within 2 weeks of being written (high churn = rework)
- [ ] Establish energy-mapped time blocks:
  - **Morning (peak energy):** Deep feature work, architecture decisions, complex debugging
  - **Midday (moderate energy):** Code review, agent-assisted refactoring, testing
  - **Afternoon (low energy):** Deploy, admin, docs, dependency updates, communications

**How to measure time-to-ship:** Add a timestamp comment to your TODO.md when you start a task. Note the deploy time when it ships. Subtract. Track in a simple spreadsheet or append to your weekly review notes.

**How to measure code churn:** Run `git log --since="2 weeks ago" --stat` weekly and note files that appear repeatedly with large diffs.

---

### Week 3: Workflow Optimization

**Goal:** Eliminate friction and protect deep work time.

- [ ] Refine your energy-mapped time blocks — add 5-minute transition rituals between blocks:
  - Stand up, refill water, write one sentence about what you just accomplished
  - This prevents "residue" from the previous task bleeding into the next
- [ ] Review your Week 2 time block data: which blocks produced the most shipped features? Double down on those.
- [ ] Set up pre-commit quality gates:
  ```bash
  # .husky/pre-commit (Node.js) or .pre-commit-config.yaml (Python)
  # Minimum viable quality gate:
  npm run lint          # or: ruff check .
  npm run typecheck     # or: mypy .
  npm run test -- --bail # or: pytest -x
  ```
- [ ] Batch communications to 3x daily (9am, 12pm, 5pm) — no Slack/email/Twitter outside those windows
- [ ] Turn off ALL notifications during dev blocks — phone on DND, Slack closed, email closed
- [ ] Create your first custom slash command ([templates below](#e-custom-slash-command--commandsfull-featuremd))

---

### Week 4: Second Agent

**Goal:** Add a second agent and validate that your system is actually faster.

- [ ] Add either a debugger agent OR a product-manager agent ([templates below](#debugger-agent))
- [ ] Use it for one full week
- [ ] Evaluate honestly: compare your Week 4 time-to-ship against Week 1-2 baselines
  - If faster: keep the agent, document what it helps with
  - If not faster: remove the agent immediately — do not keep tools that do not earn their place
- [ ] Start the weekly review ritual ([checklist below](#weekly-review-checklist))

---

### Month 2+: Incremental Growth

**Goal:** Scale your agent system based on evidence, not enthusiasm.

- [ ] Add agents one at a time — each must measurably improve output within one week
- [ ] Apply the removal test: if you disable a tool for a week and your output does not drop, you did not need it — remove it permanently
- [ ] When your TODO.md backlog exceeds ~50 items, evaluate upgrading to Linear:
  - Install the Linear MCP server for Claude Code integration
  - Migrate your TODO.md categories to Linear projects
  - Keep TODO.md for daily "Now" items if you prefer the simplicity
- [ ] Add parallel agent execution for multi-module changes:
  - Example: Agent 1 writes backend endpoint, Agent 2 writes frontend component, Agent 3 writes tests — all in parallel using separate worktrees
- [ ] Build custom commands for your most common workflows ([templates below](#e-custom-slash-command--commandsfull-featuremd))
- [ ] Re-evaluate your workflow model quarterly ([decision tree below](#decision-tree-1-which-workflow-model))

**Growth cadence:**
| Month | Focus |
|-------|-------|
| Month 2 | Add QA agent, refine code review agent prompts |
| Month 3 | Add parallel execution, custom commands for top 5 workflows |
| Month 4 | Evaluate: do you need a PM tool upgrade? More agents? Or fewer? |
| Month 5+ | Optimize what works, remove what does not |

---

## Decision Trees

### Decision Tree 1: Which Workflow Model?

```
START: How much time do you have per day?
|
+---> Can you do 12+ hour hyperfocus sessions regularly?
|     |
|     +---> YES --> PIETER LEVELS BURST MODEL
|     |             - Work in intense bursts (12-16 hrs)
|     |             - Ship entire features in single sessions
|     |             - Rest/travel between bursts
|     |             - Best for: serial entrepreneurs, nomads
|     |             - Risk: burnout if you can't actually recover
|     |
|     +---> NO
|           |
|           +---> Is this a side project / <2 hrs per day?
|                 |
|                 +---> YES --> MARC LOU 1-HOUR MINIMUM MODEL
|                 |             - Commit to exactly 1 hour minimum per day
|                 |             - Ship one small thing every session
|                 |             - Ruthlessly cut scope to fit the hour
|                 |             - Best for: side projects, employed devs
|                 |             - Key rule: never skip a day, but 1 hour is enough
|                 |
|                 +---> NO ---> ENERGY-MAPPED DAY MODEL (recommended)
|                               - 3-4 blocks mapped to energy levels
|                               - Deep work AM, admin PM
|                               - Transition rituals between blocks
|                               - Best for: full-time solo devs
|                               - See Week 3 ramp-up for implementation
```

---

### Decision Tree 2: Which Project Management Tool?

```
START: How many items are in your backlog?
|
+---> <50 items?
|     |
|     +---> YES --> TODO.md in repo root
|     |             - Zero setup, lives with your code
|     |             - Categories: Now / This Week / Backlog / Done
|     |             - Template provided below
|     |
|     +---> NO
|           |
|           +---> Do you need filtering, search, history, or team features?
|                 |
|                 +---> YES --> LINEAR + MCP SERVER
|                 |             - Install: linear-mcp-server
|                 |             - Create project per product area
|                 |             - Use cycles for weekly sprints
|                 |             - AI agents can read/write issues via MCP
|                 |
|                 +---> NO ---> TRELLO (Pieter Levels Method)
|                               - 5 columns: This Year | This Month | This Week | Today | Now
|                               - Drag cards left to right as they become urgent
|                               - Simple, visual, no learning curve
```

---

### Decision Tree 3: Which AI Coding Tool?

```
START: What is your primary workflow?
|
+---> Terminal-native? Complex multi-file changes? Architecture work?
|     |
|     +---> YES --> CLAUDE CODE
|                   - Best at: multi-file refactoring, codebase-wide changes
|                   - Agent system with custom commands
|                   - CLAUDE.md for project context
|                   - Cost: usage-based (API or Pro subscription)
|
+---> IDE-integrated? Rapid iteration? Inline editing?
|     |
|     +---> YES --> CURSOR
|                   - Best at: real-time pair programming feel
|                   - Tab completion + chat in same window
|                   - .cursorrules for project context
|                   - Cost: $20/month Pro
|
+---> Open-source? Git-integrated CLI?
|     |
|     +---> YES --> AIDER
|                   - Best at: git-aware changes, automatic commits
|                   - Works with any LLM provider
|                   - .aider.conf.yml for project context
|                   - Cost: free + LLM API costs
|
+---> Frontend prototyping? React/UI components?
|     |
|     +---> YES --> V0 BY VERCEL
|                   - Best at: generating UI components from descriptions
|                   - Outputs React/Tailwind code
|                   - Good for: MVPs, landing pages, component libraries
|                   - Cost: free tier available
|
+---> Just need autocomplete and boilerplate?
      |
      +---> YES --> GITHUB COPILOT
                    - Best at: line-by-line completion, boilerplate
                    - Lowest friction, works in any IDE
                    - Cost: $10/month Individual
```

---

## Copy-Paste Templates

### a) Agent Files

Place these in `.claude/agents/` in your home directory or project root.

#### Code Reviewer Agent

```markdown
---
name: code-reviewer
description: Reviews code changes for quality, security, and maintainability
tools:
  - Read
  - Grep
  - Glob
  - Bash
model: sonnet
---

# Code Reviewer Agent

You are a senior code reviewer. Your job is to review the current staged changes (or recent commits) and provide actionable feedback.

## Review Process

1. Run `git diff --staged` (or `git diff HEAD~1` if already committed) to see all changes
2. For each changed file, read the full file for context
3. Evaluate against the criteria below
4. Output a structured review

## Review Criteria

### CRITICAL (must fix before merge)
- Security vulnerabilities (hardcoded secrets, SQL injection, XSS)
- Data loss risks (missing validation, unhandled errors that could corrupt data)
- Breaking changes to public APIs without versioning
- Missing error handling on external calls (DB, API, file I/O)

### HIGH (should fix before merge)
- Missing input validation on user-facing endpoints
- No tests for new functionality
- Functions longer than 50 lines
- Files longer than 800 lines
- Mutable state where immutable patterns should be used
- Hardcoded values that should be constants or config

### MEDIUM (fix soon)
- Code duplication (3+ similar blocks)
- Poor naming (single-letter variables, misleading names)
- Missing types or type annotations
- Deep nesting (>4 levels)
- TODO comments without tracking issues

### LOW (nice to have)
- Style inconsistencies
- Missing JSDoc/docstrings on exported functions
- Import ordering

## Output Format

For each issue found:

```
**[SEVERITY]** filename:line_number
Description of the issue.
Suggested fix: [concrete code suggestion]
```

End with a summary:
- Total issues by severity
- Overall assessment: APPROVE / REQUEST_CHANGES / NEEDS_DISCUSSION
- One sentence on what was done well
```

#### Debugger Agent

```markdown
---
name: debugger
description: Systematically diagnoses and fixes bugs
tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Edit
model: sonnet
---

# Debugger Agent

You are an expert debugger. Your job is to systematically diagnose and fix bugs.

## Debugging Process

1. **Reproduce:** Understand the bug report. Identify the expected vs actual behavior.
2. **Isolate:** Find the smallest code path that triggers the bug.
   - Search for the relevant function/component using Grep
   - Read the file and its dependencies
   - Trace the data flow from input to output
3. **Identify Root Cause:** Do not guess. Follow the data.
   - Check: Is the input what you expect? (validation issue)
   - Check: Is the logic correct? (algorithm issue)
   - Check: Is the output transformed correctly? (serialization issue)
   - Check: Is there a race condition or timing issue? (async issue)
   - Check: Is an external dependency behaving unexpectedly? (integration issue)
4. **Fix:** Make the minimal change that fixes the root cause.
   - Do NOT fix symptoms — fix the cause
   - Prefer immutable patterns in the fix
   - Ensure the fix does not introduce new issues
5. **Verify:** Run tests. If no tests exist for this code path, write one that would have caught the bug.
6. **Explain:** Provide a clear explanation of what went wrong and why.

## Output Format

### Bug Analysis
- **Symptom:** [what the user sees]
- **Root Cause:** [what actually went wrong]
- **Location:** [file:line]
- **Fix Applied:** [description of change]
- **Test Added:** [yes/no, test name]
- **Risk Assessment:** [could this fix break anything else?]
```

#### Product Manager Agent

```markdown
---
name: product-manager
description: Helps prioritize features, write specs, and validate assumptions
tools:
  - Read
  - Grep
  - Glob
  - Bash
model: sonnet
---

# Product Manager Agent

You are an experienced product manager for a solo developer's product. Your job is to bring product discipline without bureaucracy.

## Capabilities

### 1. Feature Specification
When asked to spec a feature:
- Write a one-paragraph summary (what and why)
- List acceptance criteria as checkboxes
- Identify the riskiest assumption
- Suggest the smallest possible MVP version
- Estimate complexity: Small (hours), Medium (1-2 days), Large (3-5 days), XL (break it down further)

### 2. Prioritization
When asked to prioritize:
- Read TODO.md or the issue list
- Score each item on: Impact (1-5) x Confidence (1-5) / Effort (1-5) = Priority Score
- Sort by priority score descending
- Flag any items that are dependencies for other items
- Recommend the top 3 items to work on this week

### 3. Assumption Validation
When asked to validate:
- Identify the core assumption behind a feature
- Suggest the fastest way to test it (survey, landing page, fake door, manual process)
- Define the success metric and threshold
- Recommend: BUILD / TEST FIRST / KILL

## Output Format

### Feature Spec: [Feature Name]
**Summary:** [one paragraph]
**MVP Scope:** [smallest useful version]
**Acceptance Criteria:**
- [ ] [criterion 1]
- [ ] [criterion 2]
**Riskiest Assumption:** [what could make this worthless]
**Complexity:** [Small/Medium/Large/XL]
**Priority Score:** [Impact x Confidence / Effort]
```

#### QA Engineer Agent

```markdown
---
name: qa-engineer
description: Writes comprehensive tests and identifies edge cases
tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Edit
  - Write
model: sonnet
---

# QA Engineer Agent

You are a QA engineer. Your job is to ensure code quality through comprehensive testing.

## Process

1. **Analyze:** Read the code under test. Identify all code paths, branches, and edge cases.
2. **Plan:** Create a test plan covering:
   - Happy path (normal usage)
   - Edge cases (empty input, max values, null/undefined, boundary conditions)
   - Error cases (invalid input, network failures, timeout, permission denied)
   - Integration points (external APIs, database, file system)
3. **Write Tests:**
   - Unit tests for all public functions
   - Integration tests for API endpoints and data flows
   - Use descriptive test names: `test_[function]_[scenario]_[expected_result]`
   - Follow Arrange-Act-Assert pattern
   - One assertion per test when possible
4. **Verify Coverage:** Run the test suite with coverage reporting.
   - Target: 80% line coverage minimum
   - Flag any uncovered critical paths

## Test Quality Rules

- Tests must be deterministic — no flaky tests
- Tests must be independent — no shared mutable state between tests
- Tests must be fast — mock external dependencies
- Tests must be readable — a test is documentation
- Never test implementation details — test behavior

## Output Format

### Test Plan: [Module/Feature Name]
**Coverage Target:** [X]%
**Test Cases:**
| # | Category | Scenario | Expected Result |
|---|----------|----------|-----------------|
| 1 | Happy path | [description] | [result] |
| 2 | Edge case | [description] | [result] |
| 3 | Error case | [description] | [result] |

**Tests Written:** [number]
**Coverage Achieved:** [X]%
**Uncovered Paths:** [list any critical uncovered areas]
```

---

### b) CLAUDE.md Starter Template

Save this as `CLAUDE.md` in your project root. Fill in the bracketed sections.

```markdown
# CLAUDE.md

## Project Overview

[PROJECT_NAME] is a [type of application: web app, CLI tool, API, mobile app] that [one-sentence description of what it does and for whom].

**Primary goal:** [what success looks like for this project]
**Current stage:** [MVP / Beta / Production / Maintenance]
**Solo developer project** — all code is written or reviewed by one person with AI assistance.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | [e.g., TypeScript] | [e.g., 5.x] |
| Runtime | [e.g., Node.js] | [e.g., 20.x LTS] |
| Framework | [e.g., Next.js] | [e.g., 14.x] |
| Database | [e.g., PostgreSQL] | [e.g., 16.x] |
| ORM | [e.g., Prisma] | [e.g., 5.x] |
| Hosting | [e.g., Vercel] | - |
| CI/CD | [e.g., GitHub Actions] | - |
| Testing | [e.g., Vitest] | [e.g., 1.x] |

## Project Structure

```
[PROJECT_ROOT]/
  src/
    [describe top-level source directories and what they contain]
  tests/
    [describe test organization]
  [other important directories]
```

## Conventions

### Code Style
- [e.g., Immutable data patterns — never mutate, always return new objects]
- [e.g., Functional style preferred over classes]
- [e.g., Files should be <400 lines, extract when >800]
- [e.g., Functions should be <50 lines]
- [e.g., Maximum nesting depth: 4 levels]

### Naming
- [e.g., Files: kebab-case (user-profile.ts)]
- [e.g., Functions: camelCase (getUserProfile)]
- [e.g., Types/Interfaces: PascalCase (UserProfile)]
- [e.g., Constants: UPPER_SNAKE_CASE (MAX_RETRY_COUNT)]
- [e.g., Database tables: snake_case (user_profiles)]

### Git
- Commit format: `type: description` (types: feat, fix, refactor, docs, test, chore, perf, ci)
- Branch naming: `type/short-description` (e.g., feat/user-auth, fix/login-redirect)
- PR into `main` — squash merge preferred

### Error Handling
- [e.g., All async functions must have try/catch or .catch()]
- [e.g., API responses use envelope: { success, data, error, metadata }]
- [e.g., Never swallow errors silently — always log with context]
- [e.g., User-facing errors must be friendly; log detailed errors server-side]

### Testing
- [e.g., Minimum 80% coverage]
- [e.g., Test files colocated: feature.ts -> feature.test.ts]
- [e.g., Use describe/it blocks with descriptive names]
- [e.g., Arrange-Act-Assert pattern]

## Common Commands

```bash
# Development
[e.g., npm run dev          # Start dev server on port 3000]

# Testing
[e.g., npm test             # Run all tests]
[e.g., npm run test:cov     # Run tests with coverage report]

# Building
[e.g., npm run build        # Production build]

# Database
[e.g., npx prisma migrate dev    # Run migrations]
[e.g., npx prisma studio         # Open database GUI]

# Linting
[e.g., npm run lint         # Run ESLint]
[e.g., npm run typecheck    # Run TypeScript compiler check]
```

## API Patterns

[e.g., All endpoints follow REST conventions:]
- [e.g., GET /api/resources — list (paginated)]
- [e.g., GET /api/resources/:id — get one]
- [e.g., POST /api/resources — create]
- [e.g., PUT /api/resources/:id — full update]
- [e.g., DELETE /api/resources/:id — soft delete]

[e.g., Response envelope:]
```json
{
  "success": true,
  "data": {},
  "error": null,
  "metadata": { "total": 100, "page": 1, "limit": 20 }
}
```

## Common Mistakes to Avoid

- [e.g., Do NOT use `any` type — always define proper types]
- [e.g., Do NOT mutate function arguments — return new objects]
- [e.g., Do NOT use raw SQL — always use the ORM query builder]
- [e.g., Do NOT commit .env files — use .env.example for templates]
- [e.g., Do NOT add dependencies without checking bundle size impact]
- [e.g., Do NOT skip error handling on async operations]
- [e.g., Do NOT use index as key in React lists if items can reorder]

## Environment Variables

Required environment variables (see `.env.example`):
- `DATABASE_URL` — PostgreSQL connection string
- `[OTHER_VAR]` — [description]

## Known Gotchas

- [e.g., The auth middleware must run before the rate limiter]
- [e.g., Image uploads are limited to 5MB in the Vercel free tier]
- [e.g., The search index rebuilds nightly at 3am UTC]
```

---

### c) TODO.md Template

```markdown
# TODO

## Now
_The single task you are working on right now._

- [ ] [current task]

## Today
_What you will ship today._

- [ ] [task 1]
- [ ] [task 2]

## This Week
_Weekly goals. 3-5 items max._

- [ ] [goal 1]
- [ ] [goal 2]
- [ ] [goal 3]

## Backlog
_Future work. Roughly prioritized. Review weekly._

- [ ] [item 1]
- [ ] [item 2]
- [ ] [item 3]

## Done This Week
_Move completed items here. Clear at the start of each week._

- [x] [completed item]
```

---

### d) GitHub Actions Workflow

Save as `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"

      - run: npm ci

      - run: npm run lint
        name: Lint

      - run: npm run typecheck
        name: Type Check
        continue-on-error: false

      - run: npm test -- --coverage
        name: Test with Coverage

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"

      - run: npm ci
      - run: npm run build

      # --- DEPLOY STEP ---
      # Uncomment and configure ONE of the following:

      # Option A: Vercel
      # - uses: amondnet/vercel-action@v25
      #   with:
      #     vercel-token: ${{ secrets.VERCEL_TOKEN }}
      #     vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
      #     vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
      #     vercel-args: "--prod"

      # Option B: Netlify
      # - uses: nwtgck/actions-netlify@v3
      #   with:
      #     publish-dir: "./dist"
      #     production-deploy: true
      #   env:
      #     NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
      #     NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}

      # Option C: AWS S3 + CloudFront
      # - uses: aws-actions/configure-aws-credentials@v4
      #   with:
      #     aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
      #     aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      #     aws-region: us-east-1
      # - run: aws s3 sync ./dist s3://${{ secrets.S3_BUCKET }} --delete
      # - run: aws cloudfront create-invalidation --distribution-id ${{ secrets.CF_DISTRIBUTION_ID }} --paths "/*"

      # Option D: Railway
      # - uses: bervProject/railway-deploy@main
      #   with:
      #     railway_token: ${{ secrets.RAILWAY_TOKEN }}
      #     service: ${{ secrets.RAILWAY_SERVICE }}

      # Option E: Fly.io
      # - uses: superfly/flyctl-actions/setup-flyctl@master
      # - run: flyctl deploy --remote-only
      #   env:
      #     FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

For **Python projects**, replace the test job steps:

```yaml
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: "pip"

      - run: pip install -r requirements.txt

      - run: ruff check .
        name: Lint

      - run: mypy .
        name: Type Check

      - run: pytest --cov --cov-report=term-missing
        name: Test with Coverage
```

---

### e) Custom Slash Command — `/commands/full-feature.md`

Save as `.claude/commands/full-feature.md`:

```markdown
---
description: Full feature development cycle — from spec to deployed code
---

# Full Feature Development Cycle

Execute the following steps in order for the feature: $ARGUMENTS

## Step 1: Specification (PM Agent)

Act as a product manager. For the requested feature:
1. Write a one-paragraph summary of the feature (what and why)
2. Define the MVP scope — the smallest useful version
3. List acceptance criteria as checkboxes
4. Identify the riskiest assumption
5. Estimate complexity: Small (hours) / Medium (1-2 days) / Large (3-5 days) / XL (needs breakdown)

Present the spec and ask for confirmation before proceeding.

## Step 2: Architecture (Architect Agent)

Act as a software architect. For the confirmed spec:
1. Identify which files need to be created or modified
2. Define the data model changes (if any)
3. Define the API changes (if any)
4. List any new dependencies required
5. Flag any risks or tradeoffs

Present the architecture plan and ask for confirmation before proceeding.

## Step 3: Implementation (TDD)

Act as a senior developer following TDD:
1. Write failing tests first based on the acceptance criteria
2. Run the tests — confirm they fail
3. Write the minimal implementation to pass each test
4. Run the tests — confirm they pass
5. Refactor for clarity and maintainability
6. Run the full test suite to check for regressions

## Step 4: QA Review

Act as a QA engineer:
1. Review test coverage — flag any untested paths
2. Check edge cases: empty input, max values, null, boundary conditions
3. Check error handling: invalid input, network failure, timeout
4. Write any additional tests needed
5. Run the full test suite with coverage

## Step 5: Code Review

Act as a senior code reviewer:
1. Run `git diff` to see all changes
2. Check for: security issues, performance concerns, maintainability
3. Verify immutable patterns are used
4. Check that error handling is comprehensive
5. Confirm naming is clear and consistent
6. Provide a structured review with severity levels

## Step 6: Summary

Provide a final summary:
- What was built
- Files created/modified
- Tests added
- Any known limitations or follow-up work needed
```

---

### f) Custom Slash Command — `/commands/commit-push-pr.md`

Save as `.claude/commands/commit-push-pr.md`:

```markdown
---
description: Commit all changes, push to remote, and create a pull request
---

# Commit, Push, and Create PR

Execute the following steps for: $ARGUMENTS

## Step 1: Review Changes

1. Run `git status` to see all changes
2. Run `git diff --staged` and `git diff` to review changes
3. Summarize what changed and why

## Step 2: Stage and Commit

1. Stage all relevant files (exclude any secrets, .env files, or generated artifacts)
2. Write a commit message following conventional commits format:
   - Format: `type: description`
   - Types: feat, fix, refactor, docs, test, chore, perf, ci
   - The description should explain WHY, not just WHAT
3. Create the commit

## Step 3: Push

1. Check if the current branch has a remote tracking branch
2. If not, push with `-u` flag to set upstream
3. If yes, push normally

## Step 4: Create Pull Request

1. Determine the base branch (usually `main`)
2. Run `git log main..HEAD` to see all commits in this branch
3. Run `git diff main...HEAD` to see all changes
4. Create a PR with:
   - Title: concise summary under 70 characters
   - Body: summary of changes, acceptance criteria, test plan
5. Return the PR URL
```

---

## Checklists

### Daily Shipping Checklist

Run this every day before you close your laptop.

- [ ] Shipped at least one deployable change (commit to main or merge a PR)
- [ ] Reviewed any AI-generated code — do I understand every line?
- [ ] Updated TODO.md — moved completed items to Done, updated Now
- [ ] All commits use conventional commit format
- [ ] CI/CD pipeline is green on main
- [ ] No open PRs older than 24 hours (merge or close them)

---

### Pre-Commit Security Checklist

Run this mentally (or via agent) before every commit.

- [ ] No hardcoded secrets (API keys, passwords, tokens, connection strings)
- [ ] All user inputs validated before processing
- [ ] SQL injection prevention (parameterized queries, ORM usage)
- [ ] XSS prevention (sanitized HTML output, Content-Security-Policy headers)
- [ ] Error messages do not leak internal paths, stack traces, or database info
- [ ] No hallucinated package dependencies (verify every `import` references a real, installed package)
- [ ] Reviewed all AI-generated code — do not blindly accept suggestions
- [ ] No `.env`, credentials, or private keys in staged files
- [ ] `package-lock.json` / `requirements.txt` changes are intentional

---

### Weekly Review Checklist

Run this every Friday (or the last day of your work week). Takes 30-60 minutes.

**Metrics:**
- [ ] Review time-to-ship: is it trending down? If not, identify bottlenecks.
- [ ] Review code churn rate: are you rewriting recent code? If >30% churn, your specs or architecture need improvement.
- [ ] Automation ratio: what percentage of your workflow is automated? Identify one manual step to automate this week.

**Backlog:**
- [ ] Clean up TODO.md — archive Done items, reprioritize Backlog
- [ ] Review and merge (or close) any pending PRs
- [ ] Are there items in Backlog that will never be done? Delete them.

**Quality:**
- [ ] Update CLAUDE.md with any new conventions, gotchas, or learnings from this week
- [ ] Did I ship at least one user-facing feature this week?
- [ ] Am I building what users actually want? (Check analytics, feedback, support requests)
- [ ] Am I still fully understanding the code AI generates? If not, schedule a "manual coding" session.

**Health:**
- [ ] Did I take breaks during dev blocks?
- [ ] Did I batch communications or was I interrupt-driven?
- [ ] Energy level assessment: do I need to adjust my time blocks?

---

## Anti-Pattern Recognition Guide

### 1. Tool Collecting

**If you see:** 3+ AI coding tools installed (Copilot AND Cursor AND Claude Code AND Aider AND...).

**Do this:** Pick ONE. Uninstall the rest. Master your chosen tool for 30 days before evaluating alternatives. Switching between tools has a hidden cost: you never learn the advanced features of any of them. The best tool is the one you know deeply, not the one with the most features.

**Litmus test:** Can you name 5 advanced features of your primary tool? If not, you have not mastered it yet.

---

### 2. AI Productivity Illusion

**If you see:** You feel 2x faster, but your time-to-ship metric has not actually improved. You are generating more code but deploying the same number of features.

**Do this:** Measure actual output, not perceived velocity. Track:
- Features deployed per week (not PRs opened, not lines of code)
- Code churn rate (lines rewritten within 2 weeks)
- Time from "started" to "deployed in production"

More code is not more progress. AI makes it easy to generate code that gets thrown away.

---

### 3. Over-Engineering

**If you see:** You are designing for "scale we might need someday." You are setting up microservices, event buses, or complex infrastructure for an app with 0 users.

**Do this:** Ask: "Will this have 100 concurrent users in 6 months?" If no:
- Monolith over microservices
- SQLite over distributed databases
- Server-rendered pages over SPAs
- Flat files over message queues
- Single server over Kubernetes

You can always scale later. You cannot get back the weeks spent over-engineering. The graveyard of failed startups is full of beautifully architected systems that nobody used.

---

### 4. Building in Silence

**If you see:** You have not told anyone about your project this week. No tweets, no posts, no emails, no conversations.

**Do this:** Marketing starts on day 1, not launch day. Every week:
- Post a build update on Twitter/X, LinkedIn, or your platform of choice
- Share in one relevant community (Reddit, Discord, Hacker News, Indie Hackers)
- Email 5 potential users or customers
- Record a 60-second demo video

Building in public creates accountability, attracts early users, and surfaces feedback before you waste months on the wrong feature.

---

### 5. AI Technical Debt

**If you see:** AI-generated code "works but I do not fully understand it." You are merging code you could not debug without AI assistance.

**Do this:** Stop. Read the code line by line. For every block you cannot explain:
1. Add a comment explaining what it does (forces understanding)
2. If you still cannot explain it, rewrite it manually
3. If the AI used a pattern you do not recognize, look it up

Code you do not understand is a ticking time bomb. When it breaks at 2am, AI might not generate the same solution twice. You need to be able to debug your own system.

---

### 6. Burnout Spiral

**If you see:** Every hour feels like high-cognitive-load decision-making. You are context-switching between coding, marketing, support, ops, and strategy multiple times per day. Decision fatigue by 2pm.

**Do this:**
- Batch by role, not by task: "I am a developer from 9-12. I am a marketer from 1-2. I am an ops person from 3-4."
- Reduce decision volume: use defaults and templates for everything possible
- Schedule low-energy tasks (deploy, dependency updates, admin) for low-energy times
- Protect one 3-hour block of uninterrupted deep work per day — this is non-negotiable
- Take a real break between blocks: walk, stretch, leave the room

---

### 7. Skill Erosion

**If you see:** You have not written code without AI assistance in 2+ weeks. You instinctively reach for AI before thinking. You are not sure you could solve a medium-difficulty problem without it.

**Do this:**
- Spend one session per week (1-2 hours) coding without any AI tools
- Work on something real: a bug fix, a small feature, a refactor
- This maintains your ability to verify AI output, debug production issues, and make architectural decisions
- Think of it like a pilot practicing manual flight — the autopilot is great, but you need to be able to land the plane

---

## Further Reading

### AI-Assisted Development
- [Boris Cherny's Claude Code Workflow (Jan 2026)](https://www.infoq.com/news/2026/01/claude-code-creator-workflow/) — How Claude Code's creator runs 5 local + 10 remote sessions
- [Addy Osmani's LLM Coding Workflow](https://addyosmani.com/blog/ai-coding-workflow/) — "Specification before code" approach from Google
- [Claude Code Subagents Docs](https://code.claude.com/docs/en/sub-agents) — Official docs on multi-agent orchestration
- [Stripe Minions Architecture (Feb 2026)](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents) — How Stripe merges 1,300+ AI PRs/week

### Solo Developer Playbooks
- [Pieter Levels — How I Build MVPs](https://levels.io/how-i-build-my-minimum-viable-products/) — Ship at 70% completion, iterate from real users
- [Marc Lou — Ship Fast, Sell Faster](https://indiepattern.com/stories/marc-lou/) — 17 failed projects before $120K/month
- [Danny Postma — Solo AI Empire from Bali](https://supabird.io/articles/danny-postma-how-a-solo-hacker-built-an-ai-empire-from-bali) — Zero to $3.6M/year with HeadshotPro
- [Solo Developer's Manifesto](https://github.com/fawazahmed0/the-solo-developers-manifesto) — Principles for sustainable solo development

### Research & Data
- [METR Study — AI Impact on Developer Productivity](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/) — 19% slower with AI, perceived 24% faster
- [AI-Generated Code Creates New Technical Debt](https://www.infoq.com/news/2025/11/ai-code-technical-debt/) — 60% decline in refactored code, 48% increase in copy-paste
- [AI Coding Assistants Are Getting Worse (IEEE Spectrum)](https://spectrum.ieee.org/ai-coding-degrades) — Quality plateau and decline in 2025-2026
- [Developer AI Adoption: 84%, Trust at All-Time Low](https://www.codercops.com/blog/developer-ai-adoption-84-percent-2026) — The trust gap in AI-generated code

### Practices & Productivity
- [Conventional Commits](https://www.conventionalcommits.org/) — Standardized commit message format
- [GitHub Actions CI/CD in Four Steps](https://github.blog/enterprise-software/ci-cd/build-ci-cd-pipeline-github-actions-four-steps/) — Minimum viable deployment pipeline
