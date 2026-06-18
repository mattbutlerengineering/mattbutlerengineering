# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Agent frontmatter

An issue body may carry a fenced yaml block tagged `agent` declaring per-issue overrides for `mbe agent run`. The issue-worker loop parses it via `mbe agent frontmatter`; invalid or missing blocks fall back to the model router.

````markdown
```yaml agent
model: haiku # haiku | sonnet | opus — overrides the model router
budget: 0.50 # max USD (capped at 5.00)
max_turns: 30 # positive integer
adapter: auto # claude | gemini | opencode | auto
verify: pnpm test # shell command; must exit 0 before issue-worker opens a PR
```
````

All fields are optional. Unknown keys are ignored with a warning. Malformed yaml or invalid values never fail the loop — valid fields are kept, invalid ones are dropped with a stderr warning.

To resolve a body into `mbe agent run` flags:

```bash
gh issue view <number> --json body -q .body | mbe agent frontmatter
# → --model claude-haiku-4-5-20251001 --max-budget 0.5 --max-turns 30 --adapter auto
# → (empty line when no usable overrides)
```

To read a single field (e.g. the verify command):

```bash
gh issue view <number> --json body -q .body | mbe agent frontmatter --field verify
# → pnpm test
# → (empty line when no verify field)
```

Append the flags output to the end of the `mbe agent run` invocation — later flags win, so frontmatter overrides heuristic defaults.

The `verify:` field is not a CLI flag. The issue-worker:

1. Injects it into the agent task prompt as a done-requirement
2. Re-runs it as a gate after the agent finishes — non-zero exit triggers the agent-failed flow instead of opening a PR
