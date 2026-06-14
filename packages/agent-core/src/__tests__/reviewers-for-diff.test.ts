import { describe, it, expect } from "vitest";
import { reviewersForDiff } from "../pr-risk-classifier.js";

describe("reviewersForDiff — migration-reviewer", () => {
  it("fires for a Prisma schema change", () => {
    expect(reviewersForDiff(["services/reservations/prisma/schema.prisma"])).toContain(
      "migration-reviewer"
    );
  });

  it("fires for a migration SQL file", () => {
    expect(
      reviewersForDiff(["services/users/prisma/migrations/20260101_add/migration.sql"])
    ).toContain("migration-reviewer");
  });
});

describe("reviewersForDiff — rialto-prop-drift-detector", () => {
  it("fires for a rialto component change", () => {
    expect(reviewersForDiff(["packages/rialto/src/components/AppBar/AppBar.tsx"])).toContain(
      "rialto-prop-drift-detector"
    );
  });

  it("fires for a rialto component test change", () => {
    expect(reviewersForDiff(["packages/rialto/src/components/AppBar/AppBar.test.tsx"])).toContain(
      "rialto-prop-drift-detector"
    );
  });
});

describe("reviewersForDiff — adr-compliance-reviewer", () => {
  it("fires for a service source change", () => {
    expect(reviewersForDiff(["services/reservations/src/routes/holds.ts"])).toContain(
      "adr-compliance-reviewer"
    );
  });

  it("fires for an edge-router change", () => {
    expect(reviewersForDiff(["infrastructure/worker/src/router.ts"])).toContain(
      "adr-compliance-reviewer"
    );
  });
});

describe("reviewersForDiff — dependency-update-reviewer", () => {
  it("fires for a package.json change", () => {
    expect(reviewersForDiff(["packages/agent-core/package.json"])).toContain(
      "dependency-update-reviewer"
    );
  });

  it("fires for a lockfile change", () => {
    expect(reviewersForDiff(["pnpm-lock.yaml"])).toContain("dependency-update-reviewer");
  });
});

describe("reviewersForDiff — generated-artifact-determinism-reviewer", () => {
  it("fires for a change to the pack generator", () => {
    expect(reviewersForDiff(["tools/cli/src/commands/pack.ts"])).toContain(
      "generated-artifact-determinism-reviewer"
    );
  });

  it("fires for a per-package llms.txt change", () => {
    expect(reviewersForDiff(["packages/agent-core/llms.txt"])).toContain(
      "generated-artifact-determinism-reviewer"
    );
  });

  it("fires for the root llms-full.txt", () => {
    expect(reviewersForDiff(["llms-full.txt"])).toContain(
      "generated-artifact-determinism-reviewer"
    );
  });

  it("fires for a generated zod schema bundle", () => {
    expect(reviewersForDiff(["packages/rialto-catalog/src/generated-schemas.ts"])).toContain(
      "generated-artifact-determinism-reviewer"
    );
  });

  it("fires for the dependency-graph artifacts", () => {
    expect(reviewersForDiff(["infrastructure/worker/dep-graph.json"])).toContain(
      "generated-artifact-determinism-reviewer"
    );
    expect(reviewersForDiff(["docs/architecture/dependency-graph.md"])).toContain(
      "generated-artifact-determinism-reviewer"
    );
  });

  it("does NOT fire for a hand-written markdown doc", () => {
    expect(reviewersForDiff(["docs/adr/0001-rfc7807-errors.md"])).not.toContain(
      "generated-artifact-determinism-reviewer"
    );
  });
});

describe("reviewersForDiff — stripe-flow-reviewer", () => {
  it("fires for a payment-route source file", () => {
    expect(reviewersForDiff(["services/reservations/src/routes/payments.ts"])).toContain(
      "stripe-flow-reviewer"
    );
  });

  it("fires for a webhook handler", () => {
    expect(reviewersForDiff(["services/reservations/src/lib/webhook-handler.ts"])).toContain(
      "stripe-flow-reviewer"
    );
  });

  it("fires for a deposit-related file", () => {
    expect(reviewersForDiff(["services/reservations/src/routes/deposit.ts"])).toContain(
      "stripe-flow-reviewer"
    );
  });

  it("fires when a file name contains 'stripe'", () => {
    expect(reviewersForDiff(["services/reservations/src/lib/stripe-client.ts"])).toContain(
      "stripe-flow-reviewer"
    );
  });

  it("does NOT fire for an unrelated service source file", () => {
    expect(reviewersForDiff(["services/users/src/routes/users.ts"])).not.toContain(
      "stripe-flow-reviewer"
    );
  });

  it("does NOT fire for a rialto component", () => {
    expect(reviewersForDiff(["packages/rialto/src/components/AppBar/AppBar.tsx"])).not.toContain(
      "stripe-flow-reviewer"
    );
  });
});

describe("reviewersForDiff — no match / dedupe / order", () => {
  it("returns no reviewers for a plain library source file", () => {
    expect(reviewersForDiff(["packages/observability/src/error-rates.ts"])).toEqual([]);
  });

  it("returns nothing for an empty diff", () => {
    expect(reviewersForDiff([])).toEqual([]);
  });

  it("deduplicates when multiple files match the same reviewer", () => {
    const result = reviewersForDiff([
      "packages/rialto/src/components/AppBar/AppBar.tsx",
      "packages/rialto/src/components/Drawer/Drawer.tsx",
    ]);
    expect(result).toEqual(["rialto-prop-drift-detector"]);
  });

  it("fires multiple reviewers for a cross-cutting diff in a stable order", () => {
    const result = reviewersForDiff([
      "services/users/prisma/schema.prisma",
      "services/users/src/routes/users.ts",
      "package.json",
    ]);
    expect(result).toEqual([
      "migration-reviewer",
      "adr-compliance-reviewer",
      "dependency-update-reviewer",
    ]);
  });
});
