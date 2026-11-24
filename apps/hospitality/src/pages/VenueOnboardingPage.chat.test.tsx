import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type * as Rialto from "@mattbutlerengineering/rialto";
import { streamNDJSON } from "@mbe/api-client/streaming";
import { reportHandledError } from "@mbe/sentry/react";
import { VenueOnboardingPage } from "./VenueOnboardingPage";
import { OnboardingWizardProvider } from "../components/venue-onboarding/OnboardingWizardContext";

// Chat beside the onboarding form (#9474). The server route is mocked at the NDJSON stream.

vi.mock("../hooks/useTables.js", () => ({
  useTables: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }),
}));

vi.mock("@mbe/auth/react", () => ({
  useAuth: () => ({ accessToken: "mock-token", user: { name: "Test User" }, signOut: vi.fn() }),
}));

const mockApiClient = { venues: { getBySlug: vi.fn() } };
vi.mock("../hooks/useApiClient.js", () => ({ useApiClient: () => mockApiClient }));

vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    venues: [],
    selectedVenueId: null,
    setVenueId: vi.fn(),
    refetchVenues: vi.fn(),
  }),
}));

vi.mock("@mbe/api-client/streaming", () => ({ streamNDJSON: vi.fn() }));
vi.mock("@mbe/sentry/react", () => ({ reportHandledError: vi.fn(), reportApiError: vi.fn() }));

// The real Autocomplete and Select are popups; plain selects keep the form drivable here.
vi.mock("@mattbutlerengineering/rialto", async (importOriginal) => ({
  ...(await importOriginal<typeof Rialto>()),
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  Autocomplete: ({
    label,
    options,
    value,
    onChange,
    onSelect,
  }: {
    label?: string;
    options?: { value: string; label: string }[];
    value?: string;
    onChange?: (value: string) => void;
    onSelect?: (option: { value: string; label: string }) => void;
  }) => (
    <select
      aria-label={label}
      value={options?.find((o) => o.label === value)?.value ?? ""}
      onChange={(e) => {
        const option = options?.find((o) => o.value === e.target.value);
        if (option) {
          onChange?.(option.label);
          onSelect?.(option);
        }
      }}
    >
      <option value="">Select...</option>
      {options?.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
  Select: ({
    label,
    options,
    value,
    onChange,
  }: {
    label?: string;
    options?: { value: string; label: string }[];
    value?: string;
    onChange?: (value: string) => void;
  }) => (
    <select aria-label={label} value={value} onChange={(e) => onChange?.(e.target.value)}>
      {options?.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

const mockStream = vi.mocked(streamNDJSON);

function replyWith(...lines: unknown[]) {
  mockStream.mockImplementation(async function* () {
    for (const line of lines) yield line;
  } as unknown as typeof streamNDJSON);
}

function patchLine(step: string, data: Record<string, string>) {
  return { type: "onboarding_patch", patch: { step, data } };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OnboardingWizardProvider>
        <VenueOnboardingPage />
      </OnboardingWizardProvider>
    </MemoryRouter>
  );
}

function goToLocationStep() {
  fireEvent.change(screen.getByLabelText("Venue Name"), { target: { value: "Bistro" } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  // A known starting point whatever time zone the test machine runs in.
  fireEvent.change(screen.getByLabelText("Timezone"), { target: { value: "America/New_York" } });
}

function goToSettingsStep() {
  goToLocationStep();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
  fireEvent.click(screen.getByRole("button", { name: "Weekdays" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

async function say(text: string) {
  fireEvent.change(screen.getByRole("textbox", { name: /message|chat/i }), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

function selectValue(label: string): string {
  return (screen.getByLabelText(label) as HTMLSelectElement).value;
}

beforeEach(() => {
  vi.clearAllMocks();
  replyWith();
});

describe("onboarding chat beside the form", () => {
  it("leads the location and settings steps with a chat; other steps show the form only", () => {
    renderPage();
    expect(screen.queryByRole("log")).toBeNull();

    goToLocationStep();
    expect(screen.getByRole("log")).toBeTruthy();
    expect(screen.getByLabelText("Timezone")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.queryByRole("log")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
    fireEvent.click(screen.getByRole("button", { name: "Weekdays" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("log")).toBeTruthy();
  });

  it("offers a starter prompt for the step", () => {
    renderPage();
    goToLocationStep();
    expect(screen.getByRole("button", { name: "We're a 60-seat bistro in Lisbon" })).toBeTruthy();
  });

  it("fills the form from an applied patch, marks the fields and announces them once", async () => {
    replyWith(
      { type: "text", content: "Lisbon it is." },
      patchLine("locationTime", { ianaTimezone: "Europe/Lisbon", currencyCode: "EUR" })
    );
    renderPage();
    goToLocationStep();

    await say("We're a bistro in Lisbon");

    await waitFor(() => expect(selectValue("Timezone")).toBe("Europe/Lisbon"));
    expect(selectValue("Currency")).toBe("EUR");
    expect(screen.getAllByText("Filled from chat")).toHaveLength(2);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Time zone and currency filled from chat");
  });

  it("shows validator errors in the chat and leaves the form alone when a patch is rejected", async () => {
    replyWith(patchLine("locationTime", { ianaTimezone: "" }));
    renderPage();
    goToLocationStep();

    await say("no time zone please");

    const log = screen.getByRole("log");
    await waitFor(() => expect(within(log).getByText(/I left your form as it was/)).toBeTruthy());
    expect(selectValue("Timezone")).toBe("America/New_York");
    expect(screen.queryByText("Filled from chat")).toBeNull();
  });

  it("ignores a malformed patch and reports it", async () => {
    replyWith({ type: "text", content: "Sure." }, patchLine("locationTime", { notAField: "x" }));
    renderPage();
    goToLocationStep();

    await say("whatever");

    await waitFor(() => expect(reportHandledError).toHaveBeenCalledTimes(1));
    expect(selectValue("Timezone")).toBe("America/New_York");
  });

  it("sends a hand edit as the draft on the next request, with only this step's history", async () => {
    renderPage();
    goToLocationStep();

    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "GBP" } });
    await say("hello");

    await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(1));
    const request = mockStream.mock.calls[0]?.[0] as unknown as {
      url: string;
      body: { step: string; draft: Record<string, string>; messages: { role: string }[] };
    };
    expect(request.url).toBe("/api/gen/onboarding");
    expect(request.body.step).toBe("locationTime");
    expect(request.body.draft).toEqual({
      ianaTimezone: "America/New_York",
      currencyCode: "GBP",
    });
    expect(request.body.messages).toEqual([{ role: "user", content: "hello" }]);
  });

  it("starts each step with a fresh conversation and its own draft", async () => {
    renderPage();
    goToSettingsStep();

    await say("big parties");

    await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(1));
    const request = mockStream.mock.calls[0]?.[0] as unknown as {
      body: { step: string; draft: Record<string, string>; messages: unknown[] };
    };
    expect(request.body.step).toBe("settings");
    expect(request.body.draft).toEqual({
      defaultReservationDuration: "90",
      maxPartySize: "8",
      advanceBookingDays: "30",
    });
    expect(request.body.messages).toHaveLength(1);
  });

  it("fills the settings fields from a settings patch", async () => {
    replyWith(
      patchLine("settings", {
        defaultReservationDuration: "120",
        maxPartySize: "12",
        advanceBookingDays: "60",
      })
    );
    renderPage();
    goToSettingsStep();

    await say("long dinners, big tables");

    await waitFor(() =>
      expect(screen.getByLabelText(/^Largest party/)).toHaveProperty("value", "12")
    );
    expect(screen.getByLabelText(/^Default Reservation Duration/)).toHaveProperty("value", "120");
    expect(screen.getByRole("status").textContent).toBe(
      "Reservation length, largest party, and days ahead filled from chat"
    );
  });

  it("steps aside on the ceiling line: a calm note, no chat, and the form still works", async () => {
    replyWith({ type: "onboarding_ceiling", fallback: "form", ceilingUsd: 0.05 });
    renderPage();
    goToLocationStep();

    await say("anything");

    // The note is on the page and, once, in the live region.
    await waitFor(() =>
      expect(screen.getAllByText("Let's finish this step with the form.")).toHaveLength(2)
    );
    expect(screen.getByRole("status").textContent).toBe("Let's finish this step with the form.");
    expect(screen.queryByRole("log")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "CAD" } });
    expect(selectValue("Currency")).toBe("CAD");
  });

  it("steps aside the same way when the stream fails", async () => {
    mockStream.mockImplementation(async function* () {
      yield { type: "text", content: "..." };
      throw new Error("This UI is too large");
    } as unknown as typeof streamNDJSON);
    renderPage();
    goToLocationStep();

    await say("anything");

    await waitFor(() =>
      expect(screen.getAllByText("Let's finish this step with the form.")).toHaveLength(2)
    );
    expect(screen.queryByRole("log")).toBeNull();
  });
});
