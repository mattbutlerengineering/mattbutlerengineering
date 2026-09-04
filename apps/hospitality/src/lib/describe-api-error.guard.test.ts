import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, sep } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * B1's regression guard (architecture § `lib/describe-api-error.guard.test.ts`).
 *
 * Nothing rendered to a person may be a raw request line. Every read of an error's `.message`
 * outside this allowlist must instead go through `describeApiError`, whose `raw` field is the
 * one sanctioned home for the original text (it lands behind "Show details").
 */

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The raw pattern: `err.message`, `error?.message`, `e.message`, … */
const RAW_MESSAGE_READ =
  /\b(?:err|error|fetchError|queryError|loadError|saveError|e)\s*\??\.message\b/;

interface AllowlistEntry {
  readonly matches: (file: string) => boolean;
  readonly label: string;
  readonly reason: string;
}

const exact = (path: string) => (file: string) => file === path;
const under = (prefix: string) => (file: string) => file.startsWith(prefix);

/** Permanent allowlist — each entry carries its reason. */
const ALLOWLIST: readonly AllowlistEntry[] = [
  {
    label: "lib/describe-api-error.ts",
    matches: exact("lib/describe-api-error.ts"),
    reason: "the one sanctioned reader: turns the raw message into `raw` for the details block",
  },
  {
    label: "lib/describe-auth-error.ts",
    matches: exact("lib/describe-auth-error.ts"),
    reason: "auth voice — owned by the auth-handshake-flows run, pattern-matches OIDC messages",
  },
  {
    label: "pages/AuthFailurePage.tsx",
    matches: exact("pages/AuthFailurePage.tsx"),
    reason:
      "auth voice — renders describeAuthError's copy; the raw message only feeds its details block",
  },
  {
    label: "components/booking-widget/PaymentStep.tsx",
    matches: exact("components/booking-widget/PaymentStep.tsx"),
    reason: "Stripe's own user-facing message: already a sentence, in Stripe's voice",
  },
  {
    label: "pages/FloorPlanEditorPage.tsx",
    matches: exact("pages/FloorPlanEditorPage.tsx"),
    reason: "in flight in the venue-onboarding-floor-plan run; not this run's file",
  },
  {
    label: "components/floor-plan/**",
    matches: under("components/floor-plan/"),
    reason: "in flight in the venue-onboarding-floor-plan run; not this run's files",
  },
  {
    label: "components/venue-onboarding/**",
    matches: under("components/venue-onboarding/"),
    reason: "in flight in the venue-onboarding-floor-plan run; not this run's files",
  },
  {
    label: "hooks/useFloorPlans*",
    matches: under("hooks/useFloorPlans"),
    reason: "in flight in the venue-onboarding-floor-plan run; not this run's files",
  },
];

/**
 * Sites still reading `.message` directly when this guard was written (item 5, 2026-09-04) —
 * derived from a grep of the pattern over `src/**` minus tests minus the allowlist: 27 − 7 = 20.
 * Each later item deletes the entries it adopts `describeApiError` for; item 16 deletes the list.
 * An entry that no longer hits fails the guard, so the list cannot go stale.
 *
 * Two paths differ from breakdown.md's spelling: `useBookingFlow.ts` lives under
 * `components/booking-widget/`, not `hooks/`; `WaitlistJoinView.tsx` under
 * `components/booking-widget/`, not `components/booking/`.
 */
export const PENDING_ADOPTION: readonly string[] = [
  "components/timeline/CancelReservationDialog.tsx",
  "components/timeline/EditReservationDrawer.tsx",
  "components/timeline/StaffDepositSection.tsx",
  "components/timeline/WalkInDialog.tsx",
  "pages/TimelinePage.tsx",
];

function isSourceFile(file: string): boolean {
  return /\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file);
}

/** Every non-test .ts/.tsx file under `src/` (POSIX-relative to it) that reads `.message` raw. */
function filesReadingRawMessage(): readonly string[] {
  return readdirSync(SRC_ROOT, { recursive: true, encoding: "utf-8" })
    .map((file) => file.split(sep).join("/"))
    .filter(isSourceFile)
    .filter((file) => RAW_MESSAGE_READ.test(readFileSync(join(SRC_ROOT, file), "utf-8")))
    .sort();
}

const isAllowlisted = (file: string) => ALLOWLIST.some((entry) => entry.matches(file));

describe("B1 guard: no rendered text may be a raw request line", () => {
  const hits = filesReadingRawMessage();

  it("every raw `.message` read outside the allowlist is a PENDING_ADOPTION entry", () => {
    const unexpected = hits.filter(
      (file) => !isAllowlisted(file) && !PENDING_ADOPTION.includes(file)
    );

    expect(
      unexpected,
      `New raw \`.message\` read(s). Route them through describeApiError() and render with ErrorRetryBanner:\n  ${unexpected.join("\n  ")}`
    ).toEqual([]);
  });

  it("every PENDING_ADOPTION entry still hits — a converted site must delete its entry", () => {
    const stale = PENDING_ADOPTION.filter((file) => !hits.includes(file));

    expect(
      stale,
      `Stale PENDING_ADOPTION entr(y/ies) — the site no longer reads \`.message\`; delete:\n  ${stale.join("\n  ")}`
    ).toEqual([]);
  });

  it("PENDING_ADOPTION and the allowlist do not overlap, and every allowlist entry states a reason", () => {
    expect(PENDING_ADOPTION.filter(isAllowlisted)).toEqual([]);
    expect(ALLOWLIST.every((entry) => entry.reason.trim().length > 0)).toBe(true);
  });
});
