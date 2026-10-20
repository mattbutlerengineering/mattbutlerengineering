import { describe, it, expect, vi, beforeEach } from "vitest";
import { guestsEndpoints } from "@mbe/types";
import { ApiClient, ApiClientError, ApiValidationError } from "./client.js";
import { GuestsClient } from "./guests.js";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeClient(): GuestsClient {
  return new GuestsClient(new ApiClient({ baseUrl: "https://api.test.com", maxRetries: 0 }));
}

const fakeGuest = {
  id: "g1",
  venueId: "v1",
  email: "ada@example.com",
  phone: null,
  name: "Ada Lovelace",
  notes: null,
  visitCount: 3,
  noShowCount: 0,
  riskScore: "trusted",
  lifetimeSpend: null,
  lastVisit: null,
  tags: null,
  dietaryRestrictions: null,
  communicationPreference: "both",
  staffNotes: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function lastCall(): { url: URL; method: string | undefined; body: unknown } {
  const [url, init] = mockFetch.mock.calls[0]!;
  const rawBody = init?.body;
  return {
    url: new URL(url as string),
    method: init?.method,
    body: typeof rawBody === "string" ? JSON.parse(rawBody) : undefined,
  };
}

describe("GuestsClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("get", () => {
    it("GETs /api/v1/guests/:id with the id as a path param and unwraps data", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeGuest }));

      const guest = await makeClient().get("g1");

      const call = lastCall();
      expect(call.method).toBe("GET");
      expect(call.url.pathname).toBe(guestsEndpoints.get.path.replace(":id", "g1"));
      expect(guest).toEqual(fakeGuest);
    });

    it("rejects with ApiClientError carrying the problem details on 404", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          { type: "about:blank", title: "Not Found", status: 404, detail: "Guest not found" },
          404
        )
      );

      const error = await makeClient()
        .get("missing")
        .catch((err: unknown) => err as ApiClientError);

      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).problemDetails.detail).toBe("Guest not found");
    });

    it("rejects with ApiValidationError when the guest is malformed", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: "g1" } }));

      await expect(makeClient().get("g1")).rejects.toBeInstanceOf(ApiValidationError);
    });
  });

  describe("create", () => {
    it("POSTs the request in the body to /api/v1/guests and unwraps data", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeGuest }, 201));
      const request = { venueId: "v1", name: "Ada Lovelace", email: "ada@example.com" };

      const guest = await makeClient().create(request);

      const call = lastCall();
      expect(call.method).toBe("POST");
      expect(call.url.pathname).toBe(guestsEndpoints.create.path);
      expect(call.body).toEqual(request);
      expect(guest).toEqual(fakeGuest);
    });
  });

  describe("findOrCreate", () => {
    it("POSTs the request in the body to /api/v1/guests/find-or-create and unwraps data", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: fakeGuest }));
      const request = { venueId: "v1", name: "Ada Lovelace", phone: "+15550100" };

      const guest = await makeClient().findOrCreate(request);

      const call = lastCall();
      expect(call.method).toBe("POST");
      expect(call.url.pathname).toBe(guestsEndpoints.findOrCreate.path);
      expect(call.body).toEqual(request);
      expect(guest).toEqual(fakeGuest);
    });
  });

  describe("update", () => {
    it("PATCHes /api/v1/guests/:id with id in the path and data in the body", async () => {
      const updated = { ...fakeGuest, name: "Ada King" };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: updated }));

      const guest = await makeClient().update("g1", { name: "Ada King" });

      const call = lastCall();
      expect(call.method).toBe("PATCH");
      expect(call.url.pathname).toBe(guestsEndpoints.update.path.replace(":id", "g1"));
      expect(call.body).toEqual({ name: "Ada King" });
      expect(guest).toEqual(updated);
    });
  });

  describe("delete", () => {
    it("DELETEs /api/v1/guests/:id and resolves to undefined on 204", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

      const result = await makeClient().delete("g1");

      const call = lastCall();
      expect(call.method).toBe("DELETE");
      expect(call.url.pathname).toBe(guestsEndpoints.delete.path.replace(":id", "g1"));
      expect(result).toBeUndefined();
    });

    it("rejects with ApiClientError on 409 when the guest has reservations", async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          { type: "about:blank", title: "Conflict", status: 409, detail: "Guest has reservations" },
          409
        )
      );

      const error = await makeClient()
        .delete("g1")
        .catch((err: unknown) => err as ApiClientError);

      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).problemDetails.status).toBe(409);
    });
  });

  describe("addNote", () => {
    it("POSTs { text } to /api/v1/guests/:id/notes and unwraps the updated guest", async () => {
      const withNote = {
        ...fakeGuest,
        staffNotes: [
          { text: "Prefers window", createdBy: "u1", createdAt: "2026-01-02T00:00:00Z" },
        ],
      };
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: withNote }, 201));

      const guest = await makeClient().addNote("g1", "Prefers window");

      const call = lastCall();
      expect(call.method).toBe("POST");
      expect(call.url.pathname).toBe(guestsEndpoints.addNote.path.replace(":id", "g1"));
      expect(call.body).toEqual({ text: "Prefers window" });
      expect(guest).toEqual(withNote);
    });
  });

  describe("getSegments", () => {
    it("GETs /api/v1/guests/segments with venueId in the query and unwraps data", async () => {
      const segments = [{ name: "VIP", description: "10+ visits", count: 4 }];
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: segments }));

      const result = await makeClient().getSegments("v1");

      const call = lastCall();
      expect(call.method).toBe("GET");
      expect(call.url.pathname).toBe(guestsEndpoints.getSegments.path);
      expect(Object.fromEntries(call.url.searchParams)).toEqual({ venueId: "v1" });
      expect(result).toEqual(segments);
    });
  });

  describe("getLapsing", () => {
    it("GETs /api/v1/guests/lapsing with venueId in the query and unwraps data", async () => {
      const lapsing = [
        {
          guestId: "g1",
          name: "Ada Lovelace",
          email: "ada@example.com",
          phone: null,
          communicationPreference: "email_only",
          avgFrequencyDays: 30,
          daysSinceLastVisit: 75,
          daysOverdue: 45,
        },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: lapsing }));

      const result = await makeClient().getLapsing("v1");

      const call = lastCall();
      expect(call.method).toBe("GET");
      expect(call.url.pathname).toBe(guestsEndpoints.getLapsing.path);
      expect(Object.fromEntries(call.url.searchParams)).toEqual({ venueId: "v1" });
      expect(result).toEqual(lapsing);
    });
  });

  describe("sendWinBack", () => {
    it("POSTs to /api/v1/guests/:id/win-back with id in the path and unwraps data", async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { sent: true } }));

      const result = await makeClient().sendWinBack("g1");

      const call = lastCall();
      expect(call.method).toBe("POST");
      expect(call.url.pathname).toBe(guestsEndpoints.sendWinBack.path.replace(":id", "g1"));
      expect(result).toEqual({ sent: true });
    });
  });
});
