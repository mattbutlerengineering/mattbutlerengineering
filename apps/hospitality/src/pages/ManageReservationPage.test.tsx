import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ManageReservationPage } from "./ManageReservationPage.js";

const mockSearchParams = new URLSearchParams();
vi.mock("react-router-dom", () => ({
  useSearchParams: () => [mockSearchParams],
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams.delete("token");
});

describe("ManageReservationPage", () => {
  it("shows error when no token in URL", () => {
    render(<ManageReservationPage />);
    expect(screen.getByText("Invalid Link")).toBeDefined();
  });

  it("shows reservation details for valid token", async () => {
    mockSearchParams.set("token", "valid-token-abc");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            reservation: {
              id: "res_1",
              date: "2026-06-15",
              startTime: "19:00",
              endTime: "21:00",
              partySize: 4,
              guestName: "Jane Doe",
              guestEmail: "jane@example.com",
              guestPhone: "+1555000111",
              status: "PENDING",
              notes: "Window seat please",
            },
            venue: {
              id: "venue_1",
              name: "The Oak Table",
              slug: "the-oak-table",
              ianaTimezone: "America/Los_Angeles",
            },
          },
        }),
    });

    render(<ManageReservationPage />);

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeDefined();
    });
    expect(screen.getByText("The Oak Table")).toBeDefined();
    expect(screen.getByText("4 guests")).toBeDefined();
  });

  it("shows expired message for 410 response", async () => {
    mockSearchParams.set("token", "expired-token");
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 410,
      json: () => Promise.resolve({ error: "TOKEN_EXPIRED" }),
    });

    render(<ManageReservationPage />);

    await waitFor(() => {
      expect(screen.getByText("Link Expired")).toBeDefined();
    });
  });

  it("shows invalid message for 401 response", async () => {
    mockSearchParams.set("token", "bad-token");
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "INVALID_TOKEN" }),
    });

    render(<ManageReservationPage />);

    await waitFor(() => {
      expect(screen.getByText("Invalid Link")).toBeDefined();
    });
  });
});
