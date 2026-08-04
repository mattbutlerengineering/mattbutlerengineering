import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { CancellationPolicy } from "@mbe/cancellation-policy";
import {
  evaluateCancellationQuote,
  withQuotedFeeNote,
  useCancellationQuote,
  type CancellationQuote,
} from "./useCancellationQuote.js";
import { useVenuePolicy } from "./useVenuePolicy.js";

// The quote owns fee evaluation + label formatting; it is tested here as a pure
// function WITHOUT rendering the cancel dialog. The hook wrapper is exercised
// separately with a stubbed `useVenuePolicy`.
vi.mock("./useVenuePolicy.js", () => ({ useVenuePolicy: vi.fn() }));

const basePolicy: CancellationPolicy = {
  depositAmountCents: 5000, // $50.00
  freeCancellationHours: 2,
  lateCancellationFeePercent: 50,
  noShowFeePercent: 100,
};

// Fixed clock so timing branches are deterministic.
const NOW = new Date("2026-06-20T18:00:00Z");
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 60 * 60 * 1000);
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

describe("evaluateCancellationQuote", () => {
  it("returns null when there is no policy (dialog shows no fee section)", () => {
    expect(evaluateCancellationQuote(null, hoursFromNow(4), "usd", NOW)).toBeNull();
  });

  it("yields a free-cancellation fee and label inside the free window", () => {
    // 4h before reservation, 2h free window → free.
    const quote = evaluateCancellationQuote(basePolicy, hoursFromNow(4), "usd", NOW);
    expect(quote).not.toBeNull();
    expect(quote?.fee.feeType).toBe("none");
    expect(quote?.fee.feeAmountCents).toBe(0);
    expect(quote?.label).toMatch(/no cancellation fee/i);
    expect(quote?.label).toContain("$50.00");
  });

  it("yields a late-cancellation fee and label after the free window", () => {
    // 1h before reservation, 2h free window → late; 50% of $50 = $25.
    const quote = evaluateCancellationQuote(basePolicy, hoursFromNow(1), "usd", NOW);
    expect(quote?.fee.feeType).toBe("late");
    expect(quote?.fee.feeAmountCents).toBe(2500);
    expect(quote?.label).toMatch(/late cancellation fee/i);
    expect(quote?.label).toContain("$25.00");
  });

  it("yields a no-show fee and label at/after reservation time", () => {
    // 1h after reservation → no-show; 100% of $50 = $50 forfeited.
    const quote = evaluateCancellationQuote(basePolicy, hoursAgo(1), "usd", NOW);
    expect(quote?.fee.feeType).toBe("noshow");
    expect(quote?.fee.feeAmountCents).toBe(5000);
    expect(quote?.label).toMatch(/no-show fee/i);
    expect(quote?.label).toMatch(/\$50\.00 forfeited/i);
  });

  it("formats the label with the supplied currency", () => {
    const quote = evaluateCancellationQuote(basePolicy, hoursFromNow(4), "gbp", NOW);
    expect(quote?.label).toContain("£50.00");
  });

  it("defaults to usd when no currency is supplied", () => {
    const quote = evaluateCancellationQuote(basePolicy, hoursFromNow(4), undefined, NOW);
    expect(quote?.label).toContain("$50.00");
  });
});

describe("withQuotedFeeNote", () => {
  const feeQuote: CancellationQuote = {
    fee: {
      feeType: "noshow",
      feeAmountCents: 5000,
      refundAmountCents: 0,
      depositAction: "forfeit",
    },
    label: "No-show fee: $50.00 forfeited — refund $0.00",
    currency: "usd",
  };
  const freeQuote: CancellationQuote = {
    fee: {
      feeType: "none",
      feeAmountCents: 0,
      refundAmountCents: 5000,
      depositAction: "refund_full",
    },
    label: "No cancellation fee — full refund of $50.00",
    currency: "usd",
  };

  it("returns the note unchanged when there is no quote", () => {
    expect(withQuotedFeeNote("staff note", null)).toBe("staff note");
  });

  it("returns the note unchanged for a free cancellation (no fee to record)", () => {
    expect(withQuotedFeeNote("staff note", freeQuote)).toBe("staff note");
  });

  it("appends the quoted fee label when a fee applies", () => {
    const result = withQuotedFeeNote("staff note", feeQuote);
    expect(result).toContain("staff note");
    expect(result).toContain(feeQuote.label);
  });

  it("uses the quoted fee label as the whole note when the staff note is empty", () => {
    expect(withQuotedFeeNote("", feeQuote)).toContain(feeQuote.label);
  });
});

describe("useCancellationQuote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a quote derived from the venue policy for the given reservation time", () => {
    vi.mocked(useVenuePolicy).mockReturnValue({ policy: basePolicy, isLoading: false });
    const { result } = renderHook(() =>
      useCancellationQuote({
        slug: "the-oak-table",
        reservationTime: new Date(Date.now() + 4 * 60 * 60 * 1000),
        currency: "usd",
      })
    );
    expect(result.current.quote).not.toBeNull();
    expect(result.current.quote?.fee.feeType).toBe("none");
    expect(result.current.isLoading).toBe(false);
  });

  it("returns a null quote when no reservation time is supplied", () => {
    vi.mocked(useVenuePolicy).mockReturnValue({ policy: basePolicy, isLoading: false });
    const { result } = renderHook(() =>
      useCancellationQuote({ slug: "the-oak-table", reservationTime: undefined })
    );
    expect(result.current.quote).toBeNull();
  });

  it("returns a null quote when the venue has no policy", () => {
    vi.mocked(useVenuePolicy).mockReturnValue({ policy: null, isLoading: false });
    const { result } = renderHook(() =>
      useCancellationQuote({
        slug: "the-oak-table",
        reservationTime: new Date(Date.now() + 4 * 60 * 60 * 1000),
      })
    );
    expect(result.current.quote).toBeNull();
  });
});
