import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readFileSync } from "node:fs";
import { loadQaTuning } from "../qa-tuning-loader.js";

const mockExistsSync = existsSync as ReturnType<typeof vi.fn>;
const mockReadFileSync = readFileSync as ReturnType<typeof vi.fn>;

describe("loadQaTuning", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns null when file does not exist", () => {
    mockExistsSync.mockReturnValue(false);

    const result = loadQaTuning("/fake/repo");

    expect(result).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns thresholds for a valid config file", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        version: 1,
        lastTunedAt: "2026-05-01",
        thresholds: {
          acceptanceRateFloor: 0.85,
          maxBudgetUSD: 1.5,
          maxRetries: 2,
          stuckTurnsThreshold: 8,
          meanCloseHoursTarget: 24,
          agentMergeShareTarget: 0.3,
        },
      }),
    );

    const result = loadQaTuning("/fake/repo");

    expect(result).toEqual({
      acceptanceRateFloor: 0.85,
      maxBudgetUSD: 1.5,
      maxRetries: 2,
      stuckTurnsThreshold: 8,
      meanCloseHoursTarget: 24,
      agentMergeShareTarget: 0.3,
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns null and warns when config has wrong types", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        version: "not-a-number",
        lastTunedAt: 123,
        thresholds: {
          acceptanceRateFloor: "bad",
          maxBudgetUSD: true,
          maxRetries: null,
          stuckTurnsThreshold: [],
          meanCloseHoursTarget: {},
          agentMergeShareTarget: "wrong",
        },
      }),
    );

    const result = loadQaTuning("/fake/repo");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      "[qa-tuning] Config validation failed",
      expect.objectContaining({
        path: expect.stringContaining("auto-qa-tuning.json"),
        issues: expect.arrayContaining([
          expect.objectContaining({ message: expect.any(String) }),
        ]),
      }),
    );
  });

  it("returns null and warns on unparseable JSON", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new SyntaxError("Unexpected token");
    });

    const result = loadQaTuning("/fake/repo");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      "[qa-tuning] Failed to parse config JSON",
      expect.objectContaining({
        path: expect.stringContaining("auto-qa-tuning.json"),
        error: expect.any(String),
      }),
    );
  });

  it("returns null and warns when a required threshold field is missing", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        version: 1,
        lastTunedAt: "2026-05-01",
        thresholds: {
          acceptanceRateFloor: 0.85,
          maxBudgetUSD: 1.5,
          // missing: maxRetries, stuckTurnsThreshold, meanCloseHoursTarget, agentMergeShareTarget
        },
      }),
    );

    const result = loadQaTuning("/fake/repo");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      "[qa-tuning] Config validation failed",
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining("thresholds"),
          }),
        ]),
      }),
    );
  });

  it("returns thresholds from config with extra keys (rules, history, $comment)", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        $schema: "https://json.schemastore.org/specs/auto-qa-tuning",
        $comment: "Self-tuning thresholds",
        version: 1,
        lastTunedAt: "2026-04-25",
        thresholds: {
          acceptanceRateFloor: 0.85,
          "acceptanceRateFloor.$comment": "Minimum acceptance rate",
          maxBudgetUSD: 1.5,
          maxRetries: 2,
          stuckTurnsThreshold: 8,
          meanCloseHoursTarget: 24,
          agentMergeShareTarget: 0.3,
        },
        rules: { "tier:trivial": { maxBudgetUSDOverride: 0.5 } },
        history: [{ date: "2026-04-25", trigger: "seed" }],
      }),
    );

    const result = loadQaTuning("/fake/repo");

    expect(result).toEqual({
      acceptanceRateFloor: 0.85,
      maxBudgetUSD: 1.5,
      maxRetries: 2,
      stuckTurnsThreshold: 8,
      meanCloseHoursTarget: 24,
      agentMergeShareTarget: 0.3,
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
