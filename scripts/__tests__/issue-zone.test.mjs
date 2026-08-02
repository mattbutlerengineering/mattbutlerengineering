import { describe, test, expect } from "vitest";
import { issueZone, selectZoneSpreadBatch, SCOPE_ZONE_MAP } from "../issue-zone.mjs";

// Small helper: builds an issue-shaped object from a title (+ optional extras).
const issue = (title, extra = {}) => ({ title, labels: [], body: "", ...extra });

describe("issue-zone", () => {
  describe("issueZone — conventional-commit scope → merge-train zone", () => {
    // One assertion per workspace root, using the exact `<root>/<name>`
    // vocabulary produced by merge-train-lock's zoneForPath.
    test.each([
      ["refactor(rialto): tidy tokens", "packages/rialto"],
      ["refactor(rialto-web): fix route", "apps/rialto-web"],
      ["refactor(api-client): retry logic", "packages/api-client"],
      ["refactor(reservations): repo pattern", "services/reservations"],
      ["refactor(agent-core): prompt cache", "packages/agent-core"],
      ["refactor(agent): route schema", "services/agent"],
      ["refactor(auth): token rotation", "packages/auth"],
      ["feat(hospitality): booking widget", "apps/hospitality"],
      ["fix(users): 401 path", "services/users"],
    ])("%s → %s", (title, expected) => {
      expect(issueZone(issue(title))).toBe(expected);
    });

    test("scope maps regardless of commit type (feat/fix/refactor/chore/perf)", () => {
      for (const type of ["feat", "fix", "refactor", "chore", "perf", "ci"]) {
        expect(issueZone(issue(`${type}(rialto): x`))).toBe("packages/rialto");
      }
    });

    test("breaking-change marker (!) does not defeat scope parsing", () => {
      expect(issueZone(issue("refactor(auth)!: drop legacy token"))).toBe("packages/auth");
    });

    test("scope is case-insensitive", () => {
      expect(issueZone(issue("refactor(Rialto): x"))).toBe("packages/rialto");
    });
  });

  describe("issueZone — global (null) fallback", () => {
    test("unknown scope (not a workspace dir) → null", () => {
      // `tools/cli` is NOT under a merge-train workspace root (apps/packages/services).
      expect(issueZone(issue("refactor(cli): flag parsing"))).toBeNull();
    });

    test("non-workspace scope like `skills` → null", () => {
      expect(issueZone(issue("chore(skills): tune description"))).toBeNull();
    });

    test("scopeless conventional commit → null (global)", () => {
      expect(issueZone(issue("chore: bump deps"))).toBeNull();
    });

    test("non-conventional-commit title → null", () => {
      expect(issueZone(issue("Fix the flaky booking test"))).toBeNull();
    });

    test("empty / missing title → null", () => {
      expect(issueZone(issue(""))).toBeNull();
      expect(issueZone({})).toBeNull();
      expect(issueZone(issue(undefined))).toBeNull();
    });

    test("multiple scopes spanning distinct zones → null (cross-cutting)", () => {
      // The real #3379 title: two non-workspace scopes → global.
      expect(issueZone(issue("refactor(cli,implement-queue): zone-spread claiming"))).toBeNull();
      // One known + one unknown also spans zones → global.
      expect(issueZone(issue("refactor(rialto,cli): shared change"))).toBeNull();
      // Two distinct known zones → global.
      expect(issueZone(issue("refactor(rialto,api-client): cross change"))).toBeNull();
    });

    test("repeated identical scope collapses to that single zone", () => {
      expect(issueZone(issue("refactor(rialto,rialto): x"))).toBe("packages/rialto");
    });
  });

  describe("SCOPE_ZONE_MAP", () => {
    test("is populated from real workspace dirs and uses the merge-train vocabulary", () => {
      expect(SCOPE_ZONE_MAP.get("rialto")).toBe("packages/rialto");
      expect(SCOPE_ZONE_MAP.get("rialto-web")).toBe("apps/rialto-web");
      expect(SCOPE_ZONE_MAP.get("agent")).toBe("services/agent");
      // `cli` lives under tools/, not a workspace root → not mapped.
      expect(SCOPE_ZONE_MAP.has("cli")).toBe(false);
      // Every value follows the `<root>/<name>` shape.
      for (const zone of SCOPE_ZONE_MAP.values()) {
        expect(zone).toMatch(/^(apps|packages|services)\/[^/]+$/);
      }
    });
  });

  describe("issueZone — body-derived fallback (#3629)", () => {
    // Real body fetched via `gh issue view 3600 --json body` (a closed
    // /decompose-generated issue). Non-conventional title, real
    // `## Files to Modify/Create` section listing apps/hospitality paths.
    const ISSUE_3600_BODY = [
      "## Context",
      "",
      "Part 2 of 5 for: **Add to calendar (ICS + deep-links) on booking confirmation**",
      "",
      "Alongside the downloadable `.ics` file (#1), guests should be able to one-click add the reservation to Google Calendar or Outlook web without a download.",
      "",
      "## Task",
      "",
      "Create pure functions that build Google Calendar and Outlook web deep-link URLs from the same reservation + venue shape used in #1 (`Reservation`, `PublicVenueConfig` from `@mbe/types`). Both providers take date/time query params — no file generation, no network calls.",
      "",
      "- `buildGoogleCalendarUrl(reservation, venue, opts)` — Google Calendar deep-link",
      "- `buildOutlookCalendarUrl(reservation, venue, opts)` — Outlook web deep-link",
      "",
      "## Files to Modify/Create",
      "",
      "- `apps/hospitality/src/utils/calendarLinks.ts` — new",
      "- `apps/hospitality/src/utils/calendarLinks.test.ts` — new",
      "",
      "## Acceptance Criteria",
      "",
      "- [ ] Both builders return well-formed, URL-encoded URLs",
      "",
      "## Dependencies",
      "",
      "- Depends on: none",
      "- Blocks: #3 (Confirmation-state UI)",
      "",
      "_Created by /decompose for feature: Add to calendar (ICS + deep-links) on booking confirmation_",
    ].join("\n");
    const ISSUE_3600_TITLE = "[Feature] Add to calendar [2/5]: Google/Outlook deep-link builders";

    test("title yields no zone → falls back to body-derived paths", () => {
      const body = "## Files to Modify/Create\n\n- `apps/hospitality/src/App.tsx`\n";
      expect(issueZone(issue("Fix the flaky booking test", { body }))).toBe("apps/hospitality");
    });

    test("#3600-style [Feature] issue with a real ## Files to Modify/Create section resolves via body", () => {
      expect(issueZone(issue(ISSUE_3600_TITLE, { body: ISSUE_3600_BODY }))).toBe(
        "apps/hospitality"
      );
    });

    test("body naming paths in two different workspace roots → null", () => {
      const body =
        "## Files to Modify/Create\n\n- `apps/hospitality/src/App.tsx`\n- `packages/rialto/src/index.ts`\n";
      expect(issueZone(issue("Cross-cutting fix", { body }))).toBeNull();
    });

    test("prose tokens that merely look path-like never produce a zone", () => {
      const body =
        "Merged into main after CI Gate went green. See origin/main and " +
        "https://github.com/mattbutlerengineering/mattbutlerengineering/pull/3600 for details.";
      expect(issueZone(issue("Non-conventional title", { body }))).toBeNull();
    });

    test("falls back to scanning the whole body when no ## Files to Modify/Create section exists", () => {
      const body = "This change only touches apps/hospitality/src/utils/format.ts.";
      expect(issueZone(issue("Non-conventional title", { body }))).toBe("apps/hospitality");
    });

    test("title-derived zone takes precedence over body-derived paths", () => {
      const body = "## Files to Modify/Create\n\n- `apps/hospitality/src/App.tsx`\n";
      expect(issueZone(issue("refactor(rialto): tidy tokens", { body }))).toBe("packages/rialto");
    });

    test("missing/non-string body never throws and yields null when title yields no zone", () => {
      expect(issueZone({ title: "Non-conventional title" })).toBeNull();
      expect(issueZone({ title: "Non-conventional title", body: null })).toBeNull();
      expect(issueZone({ title: "Non-conventional title", body: 42 })).toBeNull();
    });
  });

  describe("selectZoneSpreadBatch — breadth over depth", () => {
    test("single-zone-heavy backlog yields a distinct-zone spread, not N same-zone picks", () => {
      const candidates = [
        issue("refactor(rialto): a", { number: 1 }),
        issue("refactor(rialto): b", { number: 2 }),
        issue("refactor(rialto): c", { number: 3 }),
        issue("refactor(rialto): d", { number: 4 }),
        issue("refactor(rialto): e", { number: 5 }),
        issue("refactor(auth): f", { number: 6 }),
        issue("refactor(reservations): g", { number: 7 }),
      ];
      const batch = selectZoneSpreadBatch(candidates, { maxWorkers: 3 });
      expect(batch.map((i) => i.number)).toEqual([1, 6, 7]);
      const zones = batch.map((i) => issueZone(i));
      expect(new Set(zones).size).toBe(zones.length); // all distinct
    });

    test("same-zone surplus is deferred (not stacked into one batch)", () => {
      const candidates = [
        issue("refactor(rialto): a", { number: 1 }),
        issue("refactor(rialto): b", { number: 2 }),
        issue("refactor(api-client): c", { number: 3 }),
      ];
      const batch = selectZoneSpreadBatch(candidates, { maxWorkers: 3 });
      // #2 (second rialto) deferred; #1 and #3 selected.
      expect(batch.map((i) => i.number)).toEqual([1, 3]);
    });

    test("input priority order is preserved in the output", () => {
      const candidates = [
        issue("fix(security): a", { number: 10 }), // packages? -> `security` unknown => null (global)
        issue("refactor(rialto): b", { number: 11 }),
        issue("refactor(auth): c", { number: 12 }),
      ];
      const batch = selectZoneSpreadBatch(candidates, { maxWorkers: 3 });
      expect(batch.map((i) => i.number)).toEqual([10, 11, 12]);
    });

    test("does not co-schedule two global (null-zone) issues in one batch", () => {
      const candidates = [
        issue("refactor(cli): a", { number: 1 }), // null / global
        issue("chore(skills): b", { number: 2 }), // null / global
        issue("refactor(rialto): c", { number: 3 }),
      ];
      const batch = selectZoneSpreadBatch(candidates, { maxWorkers: 3 });
      // Only the FIRST global takes the global slot; #2 deferred.
      expect(batch.map((i) => i.number)).toEqual([1, 3]);
      const globals = batch.filter((i) => issueZone(i) === null);
      expect(globals).toHaveLength(1);
    });

    test("respects the maxWorkers cap even when more distinct zones exist", () => {
      const candidates = [
        issue("refactor(rialto): a", { number: 1 }),
        issue("refactor(auth): b", { number: 2 }),
        issue("refactor(api-client): c", { number: 3 }),
        issue("refactor(reservations): d", { number: 4 }),
      ];
      const batch = selectZoneSpreadBatch(candidates, { maxWorkers: 2 });
      expect(batch.map((i) => i.number)).toEqual([1, 2]);
    });

    test("defaults to maxWorkers=3 when unspecified", () => {
      const candidates = [
        issue("refactor(rialto): a", { number: 1 }),
        issue("refactor(auth): b", { number: 2 }),
        issue("refactor(api-client): c", { number: 3 }),
        issue("refactor(reservations): d", { number: 4 }),
      ];
      expect(selectZoneSpreadBatch(candidates).map((i) => i.number)).toEqual([1, 2, 3]);
    });

    test("empty candidate list → empty batch", () => {
      expect(selectZoneSpreadBatch([])).toEqual([]);
      expect(selectZoneSpreadBatch([], { maxWorkers: 3 })).toEqual([]);
    });

    test("regression (#3629): a /decompose-shaped backlog spreads across 3 zones, not 1", () => {
      // Realistic mixed backlog: three [Feature] issues, none conventionally
      // scoped, each carrying a real ## Files to Modify/Create section that
      // names paths in a distinct workspace zone. Before #3629 every one of
      // these resolved to <global>, so selectZoneSpreadBatch returned just 1.
      const filesSection = (...paths) =>
        `## Files to Modify/Create\n\n${paths.map((p) => `- \`${p}\` — new`).join("\n")}\n`;
      const candidates = [
        issue("[Feature] Add to calendar [2/5]: Google/Outlook deep-link builders", {
          number: 3600,
          body: filesSection(
            "apps/hospitality/src/utils/calendarLinks.ts",
            "apps/hospitality/src/utils/calendarLinks.test.ts"
          ),
        }),
        issue("[Feature] Rialto DateRangePicker keyboard nav [1/3]", {
          number: 3601,
          body: filesSection(
            "packages/rialto/src/components/DateRangePicker/DateRangePicker.tsx",
            "packages/rialto/src/components/DateRangePicker/DateRangePicker.test.tsx"
          ),
        }),
        issue("[Feature] Reservations cancellation-quote caching [1/2]", {
          number: 3602,
          body: filesSection(
            "services/reservations/src/routes/cancellation-quote.ts",
            "services/reservations/src/routes/cancellation-quote.test.ts"
          ),
        }),
      ];
      const batch = selectZoneSpreadBatch(candidates, { maxWorkers: 3 });
      expect(batch.map((i) => i.number)).toEqual([3600, 3601, 3602]);
      const zones = batch.map((i) => issueZone(i));
      expect(zones).toEqual(["apps/hospitality", "packages/rialto", "services/reservations"]);
      expect(new Set(zones).size).toBe(3);
    });
  });
});
