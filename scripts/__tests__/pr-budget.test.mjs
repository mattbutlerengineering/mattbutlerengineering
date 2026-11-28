/**
 * PR budget gate (#10188): a non-draft PR adds a full CI run to the queue, so
 * it is blocked while the queue is saturated. Drafts cost no CI and always
 * pass; an override and any measurement failure always pass (fail open).
 */

import { describe, it, expect } from "vitest";
import { isNonDraftPrCreate, decidePrBudget, PR_BUDGET_THRESHOLD } from "../pr-budget.mjs";

describe("isNonDraftPrCreate", () => {
  it.each([
    ["gh pr create --base main --title t --body b", true],
    ["cd x && gh pr create --repo o/r --title t", true],
    ["gh pr create --draft --title t", false],
    ["gh pr create -d --title t", false],
    ["gh api -X POST repos/o/r/pulls -f title=t -f head=h -f base=main", true],
    ["gh api --method POST repos/o/r/pulls -f title=t -F draft=true", false],
    ["gh api repos/o/r/pulls -f title=t -f head=h", true],
    ["gh api repos/o/r/pulls?state=open", false],
    ["gh api -X PATCH repos/o/r/pulls/12 -f title=t", false],
    ["gh api -X POST repos/o/r/pulls/12/reviews -f event=APPROVE", false],
    ["gh pr view 12", false],
    ["gh pr create --draft=true --title t", false],
    ["PR_BUDGET_OVERRIDE=1 gh pr create --title t", true],
    ["git fetch && gh pr create --title t", true],
    ['grep -rn "gh pr create" .claude/', false],
    ['git commit -m "docs: mention gh pr create"', false],
    ['echo "gh api -X POST repos/o/r/pulls -f title=t"', false],
    ["git push origin HEAD", false],
  ])("%s -> %s", (command, expected) => {
    expect(isNonDraftPrCreate(command)).toBe(expected);
  });
});

describe("decidePrBudget", () => {
  const create = "gh pr create --title t";

  it("allows a non-PR command without measuring", () => {
    expect(decidePrBudget({ command: "ls", queuedPrRuns: 99 }).action).toBe("allow");
  });

  it("allows a draft PR however full the queue is", () => {
    expect(decidePrBudget({ command: "gh pr create --draft", queuedPrRuns: 99 }).action).toBe(
      "allow"
    );
  });

  it("allows a non-draft PR below the threshold", () => {
    const decision = decidePrBudget({ command: create, queuedPrRuns: PR_BUDGET_THRESHOLD - 1 });
    expect(decision.action).toBe("allow");
  });

  it("blocks a non-draft PR at the threshold and says how to batch", () => {
    const decision = decidePrBudget({ command: create, queuedPrRuns: PR_BUDGET_THRESHOLD });
    expect(decision.action).toBe("block");
    expect(decision.reason).toMatch(/--draft/);
    expect(decision.reason).toMatch(/PR_BUDGET_OVERRIDE=1/);
    expect(decision.reason).toContain("#10188");
  });

  it("allows with the override", () => {
    const decision = decidePrBudget({ command: create, queuedPrRuns: 99, override: true });
    expect(decision.action).toBe("allow");
  });

  it("fails open when the queue could not be measured", () => {
    const decision = decidePrBudget({ command: create, queuedPrRuns: null });
    expect(decision.action).toBe("allow");
    expect(decision.reason).toMatch(/could not measure/);
  });
});
