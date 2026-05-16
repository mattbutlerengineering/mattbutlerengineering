import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { relativeTime } from "./relative-time.js";

describe("relativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return near-zero time for current time", () => {
    vi.setSystemTime(new Date("2025-01-01T12:00:00Z"));
    const result = relativeTime(new Date("2025-01-01T12:00:00Z"));
    expect(result).toMatch(/now|0 seconds ago|0 seconds/);
  });

  it("should return seconds in the past", () => {
    vi.setSystemTime(new Date("2025-01-01T12:00:00Z"));
    const result = relativeTime(new Date("2025-01-01T11:59:55Z"));
    expect(result).toContain("seconds ago");
  });

  it("should return minutes in the past", () => {
    vi.setSystemTime(new Date("2025-01-01T12:00:00Z"));
    const result = relativeTime(new Date("2025-01-01T11:55:00Z"));
    expect(result).toContain("minutes ago");
  });

  it("should return hours in the past", () => {
    vi.setSystemTime(new Date("2025-01-01T12:00:00Z"));
    const result = relativeTime(new Date("2025-01-01T09:00:00Z"));
    expect(result).toContain("hours ago");
  });

  it("should return negative for future times", () => {
    vi.setSystemTime(new Date("2025-01-01T12:00:00Z"));
    const result = relativeTime(new Date("2025-01-01T12:00:30Z"));
    expect(result).toContain("in");
  });

  it("should return negative minutes for future times", () => {
    vi.setSystemTime(new Date("2025-01-01T12:00:00Z"));
    const result = relativeTime(new Date("2025-01-01T12:05:00Z"));
    expect(result).toContain("in");
  });
});
