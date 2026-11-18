import { describe, it, expect } from "vitest";
import { sections } from "./sections.js";
import { SIDENAV_CONTRACT, type NavAction, type SideNavProps } from "./types.js";

const noop = (): void => undefined;

function props(overrides: Partial<SideNavProps> = {}): SideNavProps {
  return {
    contract: SIDENAV_CONTRACT,
    pathname: "/timeline",
    locale: "en-US",
    direction: "ltr",
    flags: { isAdmin: false },
    readiness: { status: "operational", steps: ["onboarding", "operating-hours", "floor-plan"] },
    isMobileOpen: false,
    onAction: noop,
    onMobileClose: noop,
    ...overrides,
  };
}

const ids = (p: SideNavProps) => sections(p).flatMap((s) => s.items.map((i) => i.id));

describe("sections(props)", () => {
  it("is pure: same input, equal output, input untouched", () => {
    const input = props();
    const before = JSON.stringify({ ...input, onAction: undefined, onMobileClose: undefined });
    expect(sections(input)).toEqual(sections(input));
    expect(JSON.stringify({ ...input, onAction: undefined, onMobileClose: undefined })).toBe(
      before
    );
  });

  it("operational venue: primary, manage, account (with sign out) and tools (with chat)", () => {
    expect(sections(props()).map((s) => s.id)).toEqual([undefined, "Manage", "Account", "Tools"]);
    expect(ids(props())).toEqual([
      "briefing",
      "timeline",
      "reservations",
      "waitlist",
      "guests",
      "home",
      "availability",
      "setup",
      "menus",
      "booking-widget",
      "profile",
      "settings",
      "signout",
      "chat",
    ]);
  });

  it("setup venue: Get Started with the progress count badge, then account and tools", () => {
    const p = props({ readiness: { status: "setup", steps: ["onboarding"] } });
    const [getStarted] = sections(p);
    expect(getStarted?.id).toBe("Get Started");
    expect(getStarted?.items).toEqual([
      {
        id: "setup",
        label: "Availability map",
        action: { type: "route", path: "/availability/map" },
        badge: "1 of 3",
      },
    ]);
    expect(ids(p)).toEqual(["setup", "profile", "settings", "signout", "chat"]);
  });

  it("treats loading and no-venue like setup, counting zero steps", () => {
    for (const status of ["loading", "no-venue"] as const) {
      const [first] = sections(props({ readiness: { status, steps: [] } }));
      expect(first?.items[0]?.badge).toBe("0 of 3");
    }
  });

  it("hides the Admin section for non-admins and shows it for admins", () => {
    expect(ids(props({ flags: { isAdmin: false } }))).not.toContain("admin");
    expect(sections(props({ flags: { isAdmin: false } })).map((s) => s.id)).not.toContain("Admin");
    const admin = props({ flags: { isAdmin: true } });
    expect(ids(admin)).toContain("admin");
    const setupAdmin = props({
      flags: { isAdmin: true },
      readiness: { status: "setup", steps: [] },
    });
    expect(ids(setupAdmin)).toContain("admin");
    expect(ids(props({ readiness: { status: "setup", steps: [] } }))).not.toContain("admin");
  });

  it("emits every action kind in the existing NavAction union", () => {
    const actions: NavAction[] = sections(props({ flags: { isAdmin: true } })).flatMap((s) =>
      s.items.map((i) => i.action)
    );
    expect(new Set(actions.map((a) => a.type))).toEqual(new Set(["route", "chat", "signout"]));
    expect(actions.find((a) => a.type === "chat")).toEqual({ type: "chat" });
    expect(actions.find((a) => a.type === "signout")).toEqual({ type: "signout" });
  });

  it("every item has a unique id and no unknown action type", () => {
    const all = ids(props({ flags: { isAdmin: true } }));
    expect(new Set(all).size).toBe(all.length);
  });

  it("returns frozen data so a caller cannot mutate the definitions", () => {
    const out = sections(props());
    expect(Object.isFrozen(out)).toBe(true);
    expect(Object.isFrozen(out[0])).toBe(true);
  });
});
