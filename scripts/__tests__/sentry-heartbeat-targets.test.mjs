import { describe, it, expect } from "vitest";
import { TARGETS, IN_SCOPE_PROJECTS } from "../sentry-heartbeat-targets.mjs";

describe("sentry heartbeat target registry", () => {
  it("covers exactly the five in-scope Sentry projects (SC-2)", () => {
    expect(IN_SCOPE_PROJECTS).toEqual([
      "users-api",
      "reservations-api",
      "agent-api",
      "hospitality",
      "mattbutlerengineering",
    ]);
  });

  it("never includes eat-sheet, a separate product", () => {
    expect(IN_SCOPE_PROJECTS).not.toContain("eat-sheet");
    expect(TARGETS.some((target) => target.project === "eat-sheet")).toBe(false);
  });

  it("has one target per deployed artifact", () => {
    expect(TARGETS.map((target) => target.id)).toEqual([
      "users-api",
      "reservations-api",
      "agent-api",
      "hospitality",
      "marketing",
      "rialto-web",
    ]);
  });

  it("gives every browser target an app tag and no backend target one", () => {
    for (const target of TARGETS) {
      if (target.kind === "browser") expect(typeof target.app).toBe("string");
      else {
        expect(target.kind).toBe("backend");
        expect(target.app).toBeUndefined();
      }
    }
  });

  it("points every target at an https URL", () => {
    for (const target of TARGETS) expect(target.url).toMatch(/^https:\/\//);
  });

  it("is frozen, so no caller can mutate what gets checked", () => {
    expect(() => {
      "use strict";
      TARGETS.push({});
    }).toThrow();
    expect(() => {
      TARGETS[0].project = "eat-sheet";
    }).toThrow();
    expect(Object.isFrozen(IN_SCOPE_PROJECTS)).toBe(true);
  });
});
