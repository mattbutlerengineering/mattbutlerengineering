import { describe, it, expect } from "vitest";
import { parseTypedDate } from "./parse-typed-date";

const TODAY = "2024-06-10";

describe("parseTypedDate", () => {
  it.each([
    ["2024-06-20", "en-US", "2024-06-20"],
    ["Jun 20, 2024", "en-US", "2024-06-20"],
    ["june 20 2024", "en-US", "2024-06-20"],
    ["20 Jun 2024", "en-US", "2024-06-20"],
    ["6/20/2024", "en-US", "2024-06-20"],
    ["20/6/2024", "en-GB", "2024-06-20"],
    ["20.06.2024", "de-DE", "2024-06-20"],
    ["20 jun 2024", "es-MX", "2024-06-20"],
    ["20 juin 2024", "fr-CA", "2024-06-20"],
    ["  Jun 20, 2024  ", "en-US", "2024-06-20"],
  ])("reads %s in %s as %s", (text, locale, expected) => {
    expect(parseTypedDate(text, locale, TODAY)).toBe(expected);
  });

  it("reads back what the field itself displays", () => {
    for (const locale of ["en-US", "en-GB", "es-MX", "fr-CA"]) {
      const shown = new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(2024, 11, 26)));
      expect(parseTypedDate(shown, locale, TODAY)).toBe("2024-12-26");
    }
  });

  it("gives a date typed without a year its next occurrence from today", () => {
    expect(parseTypedDate("Dec 26", "en-US", TODAY)).toBe("2024-12-26");
    expect(parseTypedDate("Jun 10", "en-US", TODAY)).toBe("2024-06-10");
    expect(parseTypedDate("Jan 4", "en-US", TODAY)).toBe("2025-01-04");
    expect(parseTypedDate("1/4", "en-US", TODAY)).toBe("2025-01-04");
    expect(parseTypedDate("Feb 29", "en-US", "2024-03-01")).toBe("2028-02-29");
  });

  it.each([
    [""],
    ["   "],
    ["nonsense"],
    ["Jun"],
    ["2024"],
    ["Feb 30, 2024"],
    ["2024-02-30"],
    ["13/45/2024"],
    ["6/20/24"],
    ["Jun 20, 2024 extra"],
    ["Jun Jul 20"],
    ["1 2 3 4"],
    ["0/0/0000"],
    // Date.UTC maps years 0-99 onto 1900-1999; a typed year is never rewritten.
    ["0050-06-20"],
    ["6/20/0024"],
    ["Jun 20, 0099"],
    ["0999-06-20"],
    // A sign or a doubled separator is not a date.
    ["-5/3"],
    ["-5/3/2027"],
    ["6//20//2027"],
    ["6/20/2027/"],
    ["2027--06--20"],
    ["Jun 20,, 2027"],
  ])("returns null for %j", (text) => {
    expect(parseTypedDate(text, "en-US", TODAY)).toBeNull();
  });

  it("still reads the earliest and a comma-without-space form", () => {
    expect(parseTypedDate("1000-01-01", "en-US", TODAY)).toBe("1000-01-01");
    expect(parseTypedDate("Jun 20,2027", "en-US", TODAY)).toBe("2027-06-20");
    expect(parseTypedDate("20. Juni 2027", "de-DE", TODAY)).toBe("2027-06-20");
  });

  it("lower-cases month names by the field's locale, not the runtime's", () => {
    // Turkish upper-case dotted İ only folds to "i" under the tr locale.
    expect(parseTypedDate("20 HAZİRAN 2027", "tr-TR", TODAY)).toBe("2027-06-20");
  });

  it("returns null instead of throwing on a locale Intl rejects", () => {
    expect(parseTypedDate("Jun 20, 2024", "not a locale", TODAY)).toBeNull();
  });
});
