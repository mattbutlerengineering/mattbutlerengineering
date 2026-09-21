import { describe, it, expect } from "vitest";
import { applyPick, applyClear } from "./guest-prefill.js";

describe("guest-prefill", () => {
  describe("applyPick", () => {
    it("fills every field the profile has a non-empty value for and snapshots only those", () => {
      const current = { guestEmail: "", guestPhone: "x" };
      const { next, snapshot } = applyPick(current, { email: "a@b", phone: null });
      expect(next.guestEmail).toBe("a@b");
      expect(next.guestPhone).toBe("x");
      expect(snapshot).toStrictEqual({ guestEmail: { before: "", filled: "a@b" } });
    });

    it("overwrites a field the Host had already typed, remembering what was there", () => {
      const { next, snapshot } = applyPick(
        { guestEmail: "typed@x", guestPhone: "" },
        { email: "a@b", phone: "555" }
      );
      expect(next).toStrictEqual({ guestEmail: "a@b", guestPhone: "555" });
      expect(snapshot).toStrictEqual({
        guestEmail: { before: "typed@x", filled: "a@b" },
        guestPhone: { before: "", filled: "555" },
      });
    });

    it("treats an empty-string profile value like null", () => {
      const { next, snapshot } = applyPick(
        { guestEmail: "", guestPhone: "" },
        { email: "", phone: "555" }
      );
      expect(next).toStrictEqual({ guestEmail: "", guestPhone: "555" });
      expect(Object.keys(snapshot)).toStrictEqual(["guestPhone"]);
    });

    it("only fills fields the form actually has (the waitlist has no email field)", () => {
      const { next, snapshot } = applyPick({ guestPhone: "" }, { email: "a@b", phone: "555" });
      expect(next).toStrictEqual({ guestPhone: "555" });
      expect(snapshot).toStrictEqual({ guestPhone: { before: "", filled: "555" } });
    });

    it("returns new objects and leaves its arguments unchanged", () => {
      const current = { guestEmail: "", guestPhone: "x" };
      const profile = { email: "a@b", phone: null };
      const { next } = applyPick(current, profile);
      expect(next).not.toBe(current);
      expect(current).toStrictEqual({ guestEmail: "", guestPhone: "x" });
      expect(profile).toStrictEqual({ email: "a@b", phone: null });
    });
  });

  describe("applyClear", () => {
    it("restores the pre-pick value after an untouched pick", () => {
      const { next, snapshot } = applyPick(
        { guestEmail: "", guestPhone: "x" },
        { email: "a@b", phone: null }
      );
      expect(applyClear(next, snapshot)).toStrictEqual({ guestEmail: "", guestPhone: "x" });
    });

    it("keeps a field the Host edited since the pick and restores the rest", () => {
      const { next, snapshot } = applyPick(
        { guestEmail: "", guestPhone: "" },
        { email: "a@b", phone: "555" }
      );
      const edited = { ...next, guestEmail: "changed@x" };
      expect(applyClear(edited, snapshot)).toStrictEqual({
        guestEmail: "changed@x",
        guestPhone: "",
      });
    });

    it("returns a new object and leaves its arguments unchanged", () => {
      const snapshot = { guestEmail: { before: "", filled: "a@b" } };
      const current = { guestEmail: "a@b", guestPhone: "x" };
      const cleared = applyClear(current, snapshot);
      expect(cleared).not.toBe(current);
      expect(current).toStrictEqual({ guestEmail: "a@b", guestPhone: "x" });
      expect(snapshot).toStrictEqual({ guestEmail: { before: "", filled: "a@b" } });
    });
  });
});
