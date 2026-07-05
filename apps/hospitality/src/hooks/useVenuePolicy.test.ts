import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { createApiClient } from "@mbe/api-client";
import { useVenuePolicy } from "./useVenuePolicy.js";

/* ── Mock transport ─────────────────────────────────── */

// The hook consumes the real typed api-client; only the HTTP transport is
// stubbed, so the canonical `api.venues.getPublicConfig` parse runs end-to-end
// rather than against a hand-built envelope stub.
const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

vi.mock("./useApiClient.js", () => ({
  useApiClient: () => createApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Wraps a deposit block in a full, schema-valid public venue-config envelope. */
function publicConfigEnvelope(deposit: Record<string, unknown>): { data: unknown } {
  return {
    data: {
      name: "The Oak Table",
      slug: "the-oak-table",
      ianaTimezone: "America/New_York",
      currencyCode: "USD",
      operatingHours: null,
      settings: {},
      deposit,
    },
  };
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("useVenuePolicy", () => {
  it("fetches via api.venues.getPublicConfig and maps the deposit to a CancellationPolicy", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        publicConfigEnvelope({
          enabled: true,
          depositType: "flat",
          amountCents: 5000,
          freeCancellationHours: 24,
          lateCancellationFeePercent: 50,
          noShowFeePercent: 100,
        })
      )
    );

    const { result } = renderHook(() => useVenuePolicy("the-oak-table"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.policy).not.toBeNull();
    });

    // Canonical public venue-config seam — same path the booking widget uses.
    const [url] = mockFetch.mock.calls[0]!;
    expect(new URL(url as string).pathname).toBe("/public/v1/venues/the-oak-table");
    expect(result.current.policy).toEqual({
      depositAmountCents: 5000,
      freeCancellationHours: 24,
      lateCancellationFeePercent: 50,
      noShowFeePercent: 100,
    });
  });

  it("returns null when the deposit is disabled", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        publicConfigEnvelope({
          enabled: false,
          depositType: null,
          amountCents: null,
          freeCancellationHours: null,
          lateCancellationFeePercent: null,
          noShowFeePercent: null,
        })
      )
    );

    const { result } = renderHook(() => useVenuePolicy("the-oak-table"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.policy).toBeNull();
  });

  it("does not fetch when slug is undefined", () => {
    const { result } = renderHook(() => useVenuePolicy(undefined), {
      wrapper: createWrapper(),
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.policy).toBeNull();
  });

  it("swallows fetch errors to a null policy (non-critical staff-dialog lookup)", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "Not Found", message: "Venue not found", statusCode: 404 }, 404)
    );

    const { result } = renderHook(() => useVenuePolicy("the-oak-table"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    expect(result.current.policy).toBeNull();
  });
});
