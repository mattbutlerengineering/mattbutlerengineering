import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ManageReservationPage } from "./ManageReservationPage.js";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockSearchParams = new URLSearchParams();
vi.mock("react-router-dom", () => ({
  useSearchParams: () => [mockSearchParams],
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Stack: ({ children }: any) => <div>{children}</div>,
  Text: ({ children }: any) => <span>{children}</span>,
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
}));

// ApiClient uses fetch internally. Stub it so we control responses and can
// assert on the URL pattern it calls (verifying ApiClient routing is used).
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeOkResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeErrorResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function renderPage() {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <ManageReservationPage />
    </Wrapper>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams.delete("token");
});

describe("ManageReservationPage", () => {
  it("shows error when no token in URL", () => {
    renderPage();
    expect(screen.getByText("Invalid Link")).toBeDefined();
  });

  it("routes reservation lookup through ApiClient — calls manage endpoint via structured URL", async () => {
    mockSearchParams.set("token", "valid-token-abc");
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
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
            notes: null,
          },
          venue: {
            id: "venue_1",
            name: "The Oak Table",
            slug: "the-oak-table",
            ianaTimezone: "America/Los_Angeles",
          },
        },
      })
    );

    renderPage();
    await waitFor(() => expect(screen.getByText("Jane Doe")).toBeDefined());

    // ApiClient constructs the URL from baseUrl + path
    const calledUrl: string = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/public/v1/reservations/manage");
    expect(calledUrl).toContain("token=valid-token-abc");
  });

  it("shows reservation details for valid token", async () => {
    mockSearchParams.set("token", "valid-token-abc");
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
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
      })
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeDefined();
    });
    expect(screen.getByText("The Oak Table")).toBeDefined();
    expect(screen.getByText("4 guests")).toBeDefined();
  });

  it("shows expired message for 410 response", async () => {
    mockSearchParams.set("token", "expired-token");
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse(410, { status: 410, detail: "Token expired" })
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Link Expired")).toBeDefined();
    });
  });

  it("shows invalid message for 401 response", async () => {
    mockSearchParams.set("token", "bad-token");
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse(401, { status: 401, detail: "Invalid token" })
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Invalid Link")).toBeDefined();
    });
  });
});
