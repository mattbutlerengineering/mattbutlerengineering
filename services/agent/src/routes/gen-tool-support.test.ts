import { describe, it, expect } from "vitest";
import {
  todayIn,
  localTimeIn,
  failureLog,
  refusalOf,
  saveUnsure,
  notExecuted,
  failedBeforeWrite,
  resolveTable,
  type NamedTable,
} from "./gen-tool-support.js";

describe("todayIn", () => {
  it("renders YYYY-MM-DD for the given instant in the venue's time zone", () => {
    expect(todayIn("America/New_York", new Date("2026-01-15T05:00:00Z"))).toBe("2026-01-15");
  });

  it("falls back to UTC when no time zone is given, without throwing", () => {
    expect(todayIn(undefined, new Date("2026-01-15T00:00:00Z"))).toBe("2026-01-15");
  });
});

describe("localTimeIn", () => {
  it("renders venue-local 24-hour HH:mm for an ISO instant", () => {
    expect(localTimeIn("2026-01-15T23:30:00Z", "UTC")).toBe("23:30");
  });

  it("returns undefined for non-string input instead of throwing", () => {
    expect(localTimeIn(12345, "UTC")).toBeUndefined();
    expect(localTimeIn(undefined, "UTC")).toBeUndefined();
  });

  it("returns undefined for a non-ISO/garbage time string", () => {
    expect(localTimeIn("not a date", "UTC")).toBeUndefined();
  });

  it("returns undefined for an invalid IANA time zone instead of throwing", () => {
    expect(localTimeIn("2026-01-15T23:30:00Z", "Not/AZone")).toBeUndefined();
  });
});

describe("failureLog", () => {
  it("logs status and code when the error carries problemDetails", () => {
    expect(failureLog({ problemDetails: { status: 404, code: "not_found" } })).toEqual({
      status: 404,
      code: "not_found",
    });
  });

  it("logs the error name when it carries a path (a client error with no problemDetails)", () => {
    expect(failureLog({ path: "/v1/guests?search=smith", name: "ApiClientError" })).toEqual({
      failure: "ApiClientError",
    });
  });

  it("logs the whole error when it carries neither problemDetails nor a path (network failure)", () => {
    const err = new Error("ECONNRESET");
    expect(failureLog(err)).toEqual({ err });
  });

  it("treats a nullish error like an empty object", () => {
    expect(failureLog(undefined)).toEqual({ err: undefined });
  });
});

describe("refusalOf", () => {
  it("extracts a Refusal from a 4xx problemDetails error, filling in defaults", () => {
    expect(refusalOf({ problemDetails: { status: 409 } })).toEqual({
      status: 409,
      detail: "The request was refused (409).",
    });
  });

  it("keeps the original detail, code, and reason when present", () => {
    expect(
      refusalOf({
        problemDetails: {
          status: 422,
          detail: "Table is occupied.",
          code: "table_occupied",
          reason: "occupied",
        },
      })
    ).toEqual({
      status: 422,
      detail: "Table is occupied.",
      code: "table_occupied",
      reason: "occupied",
    });
  });

  it("returns undefined for a transient 408/429 status", () => {
    expect(refusalOf({ problemDetails: { status: 408 } })).toBeUndefined();
    expect(refusalOf({ problemDetails: { status: 429 } })).toBeUndefined();
  });

  it("returns undefined for a 5xx or non-API error", () => {
    expect(refusalOf({ problemDetails: { status: 500 } })).toBeUndefined();
    expect(refusalOf(new Error("network down"))).toBeUndefined();
    expect(refusalOf(null)).toBeUndefined();
  });
});

describe("saveUnsure", () => {
  it("preserves the exact wording other code may match on", () => {
    expect(saveUnsure("the reservation list")).toBe(
      "Couldn't confirm the change was saved. Check the reservation list before trying again."
    );
  });
});

describe("notExecuted", () => {
  it("tags a result with notExecuted: true without mutating the input", () => {
    const input = { ok: true };
    const tagged = notExecuted(input);
    expect(tagged).toEqual({ ok: true, notExecuted: true });
    expect(input).toEqual({ ok: true });
    expect(tagged).not.toBe(input);
  });
});

describe("failedBeforeWrite", () => {
  it("marks the result notExecuted when no write was ever sent (unsure is undefined)", () => {
    expect(failedBeforeWrite(undefined, { ok: false })).toEqual({ ok: false, notExecuted: true });
  });

  it("leaves the result as-is when a write may have gone out (unsure is set)", () => {
    expect(failedBeforeWrite("the guest list", { ok: false })).toEqual({ ok: false });
  });
});

describe("resolveTable", () => {
  const tables: NamedTable[] = [
    { id: "1", tableNumber: "12", name: "Patio 2" },
    { id: "2", tableNumber: "7", name: "Window" },
    { id: "3", tableNumber: "7a", name: "window" },
  ];

  it("matches by exact table number first", () => {
    expect(resolveTable(tables, "12")).toEqual({ table: tables[0] });
  });

  it("matches by exact name when no number matches", () => {
    expect(resolveTable(tables, "Window")).toEqual({ table: tables[1] });
  });

  it("matches by case-insensitive name as the last resort", () => {
    const onlyCaseVariant: NamedTable[] = [{ id: "9", tableNumber: "99", name: "Garden" }];
    expect(resolveTable(onlyCaseVariant, "garden")).toEqual({ table: onlyCaseVariant[0] });
  });

  it("trims whitespace from the reference before matching", () => {
    expect(resolveTable(tables, "  12  ")).toEqual({ table: tables[0] });
  });

  it("returns an ambiguous error when more than one table matches a step", () => {
    const ambiguous: NamedTable[] = [
      { id: "a", name: "GARDEN" },
      { id: "b", name: "Garden" },
    ];
    expect(resolveTable(ambiguous, "garden")).toEqual({
      error: "Table garden is ambiguous in this venue. Ask which table they mean.",
    });
  });

  it("returns a not-found error when nothing matches", () => {
    expect(resolveTable(tables, "nope")).toEqual({
      error: "Table nope not found in this venue.",
    });
  });
});
