import { describe, it, expect } from "vitest";
import { ApiClientError } from "@mbe/api-client";
import { describeApiError, ERROR_COPY } from "./describe-api-error.js";

const PATH = "/api/v1/reservations/walk-in";

function apiError(status: number, detail = "", title = "Error"): ApiClientError {
  return new ApiClientError({ type: "about:blank", title, status, detail }, "POST", PATH);
}

describe("describeApiError", () => {
  describe("one house sentence per ApiClientError category", () => {
    it.each([
      [500, "serverError", true, "retry"],
      [503, "serverError", true, "retry"],
      [429, "rateLimited", true, "retry"],
      [409, "conflict", false, "edit"],
      [422, "validationError", false, "edit"],
      [400, "badRequest", false, "edit"],
      [401, "unauthorized", false, "sign-in"],
      [403, "forbidden", false, "none"],
      [404, "notFound", false, "refresh"],
      [418, "unknown", true, "retry"],
    ] as const)("%i → %s", (status, category, retryable, recovery) => {
      const error = apiError(status);

      expect(describeApiError(error)).toEqual({
        category,
        detail: ERROR_COPY[category].detail,
        retryable,
        recovery,
        raw: error.message,
      });
    });

    it("recognises an ApiClientError by shape, so a mocked @mbe/api-client still categorises", () => {
      const shaped = Object.assign(new Error(`POST ${PATH} failed: 409 `), {
        name: "ApiClientError",
        category: "conflict",
        problemDetails: { type: "about:blank", title: "Conflict", status: 409, detail: "" },
      });

      expect(describeApiError(shaped).category).toBe("conflict");
      expect(describeApiError(shaped).detail).toBe(ERROR_COPY.conflict.detail);
    });
  });

  describe("problemDetails.detail precedence", () => {
    it.each([409, 422, 400])(
      "%i shows problemDetails.detail verbatim when it is non-empty",
      (status) => {
        const described = describeApiError(
          apiError(status, "Table 3 was just taken by another host.")
        );

        expect(described.detail).toBe("Table 3 was just taken by another host.");
        expect(described.retryable).toBe(false);
        expect(described.recovery).toBe("edit");
      }
    );

    it("does not let other categories borrow problemDetails.detail", () => {
      expect(describeApiError(apiError(500, "ECONNREFUSED 10.0.0.4:5432")).detail).toBe(
        ERROR_COPY.serverError.detail
      );
      expect(describeApiError(apiError(404, "Reservation res_1 not found")).detail).toBe(
        ERROR_COPY.notFound.detail
      );
    });

    it.each(["", "   ", "409", "undefined"])(
      "falls back to the house sentence when problemDetails.detail is %j",
      (detail) => {
        expect(describeApiError(apiError(409, detail)).detail).toBe(ERROR_COPY.conflict.detail);
      }
    );
  });

  describe("the two non-HTTP cases", () => {
    it("network: a TypeError (fetch failed after the client's retries) is retryable", () => {
      expect(describeApiError(new TypeError("Failed to fetch"))).toEqual({
        category: "network",
        detail: ERROR_COPY.network.detail,
        retryable: true,
        recovery: "retry",
        raw: "Failed to fetch",
      });
    });

    it.each(["TimeoutError", "AbortError"])("timeout: a DOMException named %s", (name) => {
      const described = describeApiError(new DOMException("signal timed out", name));

      expect(described.category).toBe("timeout");
      expect(described.detail).toBe(ERROR_COPY.timeout.detail);
      expect(described.retryable).toBe(true);
      expect(described.recovery).toBe("retry");
      expect(described.raw).toBe("signal timed out");
    });
  });

  describe("everything else is unknown, and nothing throws", () => {
    it.each([
      undefined,
      null,
      "boom",
      42,
      { code: "E_WEIRD" },
      new Error("plain"),
      new RangeError("r"),
    ])("%s → unknown", (thrown) => {
      const described = describeApiError(thrown);

      expect(described.category).toBe("unknown");
      expect(described.detail).toBe(ERROR_COPY.unknown.detail);
      expect(described.retryable).toBe(true);
      expect(described.recovery).toBe("retry");
      expect(typeof described.raw).toBe("string");
    });

    it("raw is the original message for Errors, the message field of a plain object, else String(value)", () => {
      expect(describeApiError(new Error("plain")).raw).toBe("plain");
      expect(describeApiError({ message: "from a plain object" }).raw).toBe("from a plain object");
      expect(describeApiError("boom").raw).toBe("boom");
      expect(describeApiError(42).raw).toBe("42");
    });
  });

  it("raw keeps api-client's `<METHOD> <path> failed: <status>` line and detail never does — the E2E `/failed: 500/` negative oracles depend on this shape", () => {
    const failed = new ApiClientError(
      { type: "about:blank", title: "Internal Server Error", status: 500, detail: "" },
      "PATCH",
      "/api/v1/users/usr_e2e_001"
    );
    const description = describeApiError(failed);
    expect(failed.message).toMatch(/^PATCH \/api\/v1\/users\/usr_e2e_001 failed: 500\b/);
    expect(description.raw).toBe(failed.message);
    expect(description.detail).not.toMatch(/failed: 500/);
  });

  it("never puts undefined or a bare status code in detail (B1.1, B1.2)", () => {
    const thrown: unknown[] = [
      ...[400, 401, 403, 404, 409, 418, 422, 429, 500, 503].map((status) => apiError(status)),
      apiError(409, "409"),
      apiError(422, "undefined"),
      new TypeError("Failed to fetch"),
      new DOMException("t", "TimeoutError"),
      undefined,
      "boom",
    ];

    for (const value of thrown) {
      const { detail } = describeApiError(value);
      expect(detail.trim().length).toBeGreaterThan(0);
      expect(detail).not.toMatch(/undefined/);
      expect(detail).not.toMatch(/\b\d{3}\b/);
    }
  });

  it("every sentence, verbatim from ux.md § Copy (NF TONE)", () => {
    const sentences = Object.fromEntries(
      Object.entries(ERROR_COPY).map(([category, row]) => [category, row.detail])
    );

    expect(sentences).toMatchInlineSnapshot(`
      {
        "badRequest": "Something in the form didn't pass. Check party size, time and table.",
        "conflict": "Someone got there first — that table or time was just taken. Pick another.",
        "forbidden": "That's above your role. Ask a manager to make this change.",
        "network": "Can't reach the reservations service. Check the venue's connection, then try again.",
        "notFound": "That reservation's gone — it may have been cancelled or moved. Refreshing the grid.",
        "rateLimited": "Too many requests at once. Give it a few seconds, then try again.",
        "serverError": "The reservations service hit a snag — nothing was changed. Try again in a moment.",
        "timeout": "That took too long. The service didn't answer in time — try again.",
        "unauthorized": "Your session ended. Sign in again to keep working.",
        "unknown": "That didn't go through. Try again — if it keeps happening, tell your manager.",
        "validationError": "Something in the form didn't pass. Check party size, time and table.",
      }
    `);
  });
});
