import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BookingWidget } from "./BookingWidget.js";
import { usePublicApiClient } from "../../hooks/usePublicApiClient.js";
import React from "react";

process.env.TZ = "UTC";

vi.mock("../../hooks/usePublicApiClient.js", () => ({
  usePublicApiClient: vi.fn(),
}));

// Mock Stripe so the real (unmocked) PaymentStep can render and be driven to
// completion — needed for the per_person-total regression test below, which
// must exercise the actual confirmation → payment → deposit-success path.
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="stripe-elements">{children}</div>
  ),
  CardElement: () => <div data-testid="card-element" />,
  useStripe: vi.fn(),
  useElements: vi.fn(),
}));

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn().mockResolvedValue(null),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Steps: ({ currentStep, steps }: any) => (
    <div data-testid="steps" data-current={currentStep}>
      {steps?.[currentStep]?.label}
    </div>
  ),
  Text: ({ children }: any) => <div>{children}</div>,
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Card: ({ children }: any) => <div>{children}</div>,
  Heading: ({ children }: any) => <h2>{children}</h2>,
  Stack: ({ children }: any) => <div>{children}</div>,
  Badge: ({ children }: any) => <span>{children}</span>,
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonGroup: ({ children }: any) => <div>{children}</div>,
  Alert: ({ children }: any) => <div data-testid="alert">{children}</div>,
  EmptyState: ({ heading }: any) => <div>{heading}</div>,
  Input: (props: any) => {
    const id = props.id || props.label?.replace(/\s+/g, "-").toLowerCase() || "input";
    return (
      <div>
        <label htmlFor={id}>{props.label}</label>
        <input
          id={id}
          {...props}
          onChange={(e) => props.onChange?.({ target: { value: e.target.value } } as any)}
        />
      </div>
    );
  },
  Label: ({ children }: any) => <label>{children}</label>,
  TextArea: (props: any) => {
    const id = props.id || props.label?.replace(/\s+/g, "-").toLowerCase() || "textarea";
    return (
      <div>
        <label htmlFor={id}>{props.label}</label>
        <textarea id={id} {...props} onChange={(e) => props.onChange?.(e.target.value)} />
      </div>
    );
  },
  Icon: () => <div />,
}));

describe("BookingWidget", () => {
  const mockApi = {
    availability: {
      getTimeSlots: vi.fn(),
    },
    holds: {
      create: vi.fn(),
      confirm: vi.fn(),
    },
    venues: {
      getPublicConfig: vi.fn(),
    },
    publicVenue: {
      guestRisk: vi.fn(),
      depositIntent: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(usePublicApiClient).mockReturnValue(mockApi as any);
  });

  const renderWidget = () => render(<BookingWidget venueId="v1" />);

  it("completes the full booking flow", async () => {
    // Step 1: Date & Party
    renderWidget();
    expect(screen.getByText("Date & Party")).toBeDefined();

    // Simulate date selection
    const dateInput = screen.getByLabelText("Date");
    fireEvent.change(dateInput, { target: { value: "2026-05-20" } });

    mockApi.availability.getTimeSlots.mockResolvedValue([
      { time: "2026-05-20T18:00:00", available: true },
      { time: "2026-05-20T19:00:00", available: true },
    ]);

    const nextBtn = screen.getByText("Find Available Times");
    fireEvent.click(nextBtn);

    // Step 2: Time
    await waitFor(() => expect(screen.getByText("Time")).toBeDefined());
    // Slots render asynchronously after the "Time" heading; await the first slot
    // so the click below doesn't race the slot list render (flaky on slow CI).
    expect(await screen.findByText(/6:00 PM/i)).toBeDefined();
    expect(screen.getByText(/7:00 PM/i)).toBeDefined();

    mockApi.holds.create.mockResolvedValue({
      hold: {
        id: "hold-1",
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      },
    });

    fireEvent.click(screen.getByText(/6:00 PM/i));

    // Step 3: Details
    await waitFor(() => expect(screen.getByText("Details")).toBeDefined());

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "John Doe" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "john@example.com" } });

    mockApi.holds.confirm.mockResolvedValue({
      id: "res-123",
      status: "CONFIRMED",
      date: "2026-05-20",
      startTime: "18:00",
      partySize: 2,
    });

    fireEvent.click(screen.getByText("Complete Reservation"));

    // Step 4: Confirmation
    await waitFor(() => expect(screen.getByText("Reservation Confirmed!")).toBeDefined());
    expect(screen.getByText("RES-123")).toBeDefined();
  });

  it("handles availability errors", async () => {
    renderWidget();
    const dateInput = screen.getByLabelText("Date");
    fireEvent.change(dateInput, { target: { value: "2026-05-20" } });

    mockApi.availability.getTimeSlots.mockRejectedValue(new Error("API Down"));

    fireEvent.click(screen.getByText("Find Available Times"));

    await waitFor(() => expect(screen.getByText("API Down")).toBeDefined());
  });

  it("shows payment step for risky guest even when venue has no deposit policy", async () => {
    // Guest-risk lookup now goes through the typed api.publicVenue.guestRisk() client method.
    mockApi.publicVenue.guestRisk.mockResolvedValue({
      riskScore: "risky",
      noShowCount: 2,
      requiresDeposit: true,
    });

    // Venue config — deposit enabled with amount (required for payment step) —
    // now goes through the typed api.venues.getPublicConfig() client method.
    mockApi.venues.getPublicConfig.mockResolvedValue({
      name: "The Oak Table",
      slug: "the-oak-table",
      ianaTimezone: "America/New_York",
      currencyCode: "USD",
      operatingHours: null,
      settings: {},
      deposit: {
        enabled: true,
        depositType: "flat",
        amountCents: 5000,
        freeCancellationHours: null,
        lateCancellationFeePercent: null,
        noShowFeePercent: null,
      },
    });

    render(
      <BookingWidget venueId="v1" venueSlug="the-oak-table" stripePublishableKey="pk_test_abc" />
    );

    // Step 1: Date & Party
    const dateInput = screen.getByLabelText("Date");
    fireEvent.change(dateInput, { target: { value: "2026-05-20" } });

    mockApi.availability.getTimeSlots.mockResolvedValue([
      { time: "2026-05-20T18:00:00", available: true },
    ]);
    fireEvent.click(screen.getByText("Find Available Times"));

    // Step 2: Time
    await waitFor(() => expect(screen.getByText("Time")).toBeDefined());
    mockApi.holds.create.mockResolvedValue({
      hold: { id: "hold-1", expiresAt: new Date(Date.now() + 600000).toISOString() },
    });
    // Slots render asynchronously after the "Time" heading; await the slot so the
    // click doesn't race the slot list render (flaky on slow CI — Node 20 leg).
    fireEvent.click(await screen.findByText(/6:00 PM/i));

    // Step 3: Details
    await waitFor(() => expect(screen.getByText("Details")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Risky Guest" } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "risky@example.com" },
    });

    mockApi.holds.confirm.mockResolvedValue({
      id: "res-456",
      status: "CONFIRMED",
      date: "2026-05-20",
      startTime: "18:00",
      partySize: 2,
    });

    fireEvent.click(screen.getByText("Complete Reservation"));

    // Should go to Payment step (not skip to Confirmation)
    await waitFor(() => expect(screen.getByText("Payment")).toBeDefined());
  });

  it("does not call the guest-risk endpoint when Stripe is not configured", async () => {
    // Regression test (review retry): the guest-risk lookup carries PII
    // (email/phone) and must only fire when the venue's Stripe integration is
    // actually configured (venueSlug + stripePublishableKey), matching
    // effectiveDepositPolicy's own gating. It must never fire just because the
    // venue's deposit policy happens to be disabled.
    mockApi.publicVenue.guestRisk.mockResolvedValue({
      riskScore: "risky",
      noShowCount: 1,
      requiresDeposit: true,
    });

    mockApi.venues.getPublicConfig.mockResolvedValue({
      name: "The Oak Table",
      slug: "the-oak-table",
      ianaTimezone: "America/New_York",
      currencyCode: "USD",
      operatingHours: null,
      settings: {},
      deposit: {
        enabled: false,
        depositType: null,
        amountCents: null,
        freeCancellationHours: null,
        lateCancellationFeePercent: null,
        noShowFeePercent: null,
      },
    });

    // venueSlug is set but stripePublishableKey is deliberately omitted
    // (defaults to "" — Stripe not configured for this venue).
    render(<BookingWidget venueId="v1" venueSlug="the-oak-table" />);

    const dateInput = screen.getByLabelText("Date");
    fireEvent.change(dateInput, { target: { value: "2026-05-20" } });

    mockApi.availability.getTimeSlots.mockResolvedValue([
      { time: "2026-05-20T18:00:00", available: true },
    ]);
    fireEvent.click(screen.getByText("Find Available Times"));

    await waitFor(() => expect(screen.getByText("Time")).toBeDefined());
    mockApi.holds.create.mockResolvedValue({
      hold: { id: "hold-1", expiresAt: new Date(Date.now() + 600000).toISOString() },
    });
    fireEvent.click(await screen.findByText(/6:00 PM/i));

    await waitFor(() => expect(screen.getByText("Details")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Some Guest" } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "guest@example.com" },
    });

    mockApi.holds.confirm.mockResolvedValue({
      id: "res-789",
      status: "CONFIRMED",
      date: "2026-05-20",
      startTime: "18:00",
      partySize: 2,
    });

    fireEvent.click(screen.getByText("Complete Reservation"));

    // Deposit disabled + Stripe unconfigured → straight to Confirmation.
    await waitFor(() => expect(screen.getByText("Reservation Confirmed!")).toBeDefined());

    expect(mockApi.publicVenue.guestRisk).not.toHaveBeenCalled();
  });

  it("shows the charged TOTAL (base × partySize) as the authorized amount for per_person deposits", async () => {
    // Regression test for #2982: the confirmation screen must show what
    // Stripe actually authorized (base × partySize), not the per-person
    // base amount.
    const { useStripe, useElements } = await import("@stripe/react-stripe-js");
    vi.mocked(useStripe).mockReturnValue({
      confirmCardPayment: vi.fn().mockResolvedValue({
        paymentIntent: { id: "pi_test_total" },
      }),
    } as unknown as ReturnType<typeof useStripe>);
    vi.mocked(useElements).mockReturnValue({
      getElement: vi.fn().mockReturnValue({ mount: vi.fn() }),
    } as unknown as ReturnType<typeof useElements>);

    mockApi.venues.getPublicConfig.mockResolvedValue({
      name: "The Oak Table",
      slug: "the-oak-table",
      ianaTimezone: "America/New_York",
      currencyCode: "USD",
      operatingHours: null,
      settings: {},
      deposit: {
        enabled: true,
        depositType: "per_person",
        amountCents: 1000, // $10.00 per guest
        freeCancellationHours: null,
        lateCancellationFeePercent: null,
        noShowFeePercent: null,
      },
    });
    mockApi.publicVenue.depositIntent.mockResolvedValue({
      clientSecret: "pi_secret_test",
      depositId: "dep-1",
      amountCents: 4000,
      currency: "usd",
    });

    render(
      <BookingWidget venueId="v1" venueSlug="the-oak-table" stripePublishableKey="pk_test_abc" />
    );

    // Step 1: Date & party of 4
    const dateInput = screen.getByLabelText("Date");
    fireEvent.change(dateInput, { target: { value: "2026-05-20" } });
    fireEvent.click(screen.getByRole("button", { name: "4" }));

    mockApi.availability.getTimeSlots.mockResolvedValue([
      { time: "2026-05-20T18:00:00", available: true },
    ]);
    fireEvent.click(screen.getByText("Find Available Times"));

    // Step 2: Time
    await waitFor(() => expect(screen.getByText("Time")).toBeDefined());
    mockApi.holds.create.mockResolvedValue({
      hold: { id: "hold-1", expiresAt: new Date(Date.now() + 600000).toISOString() },
    });
    fireEvent.click(await screen.findByText(/6:00 PM/i));

    // Step 3: Details
    await waitFor(() => expect(screen.getByText("Details")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Party Of Four" } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "party@example.com" },
    });

    mockApi.holds.confirm.mockResolvedValue({
      id: "res-per-person",
      status: "CONFIRMED",
      date: "2026-05-20",
      startTime: "18:00",
      partySize: 4,
    });

    fireEvent.click(screen.getByText("Complete Reservation"));

    // Step 4: Payment — real PaymentStep renders (only Stripe internals mocked).
    // 4 guests × $10.00 = $40.00 is the amount Stripe actually authorizes.
    await waitFor(() => expect(screen.getByText(/Authorize \$40\.00/)).toBeDefined());
    fireEvent.click(screen.getByText(/Authorize \$40\.00/));

    // Step 5: Confirmation — the "authorized for" notice must show the
    // charged TOTAL ($40.00), never the per-person base ($10.00).
    await waitFor(() => expect(screen.getByText("Reservation Confirmed!")).toBeDefined());
    const depositNotice = screen.getByText(/authorized for/i);
    expect(depositNotice.textContent).toContain("$40.00");
    expect(depositNotice.textContent).not.toContain("$10.00");
  });

  it("reaches the payment step and shows correct cancellation terms for a risky guest when the venue's general deposit policy is disabled but a deposit is configured", async () => {
    // Regression test for #3094: fetchDepositConfig previously gated on
    // venueConfig.deposit.enabled, so a "configured then disabled" venue
    // (general policy off, but deposit fields still populated) never set
    // data.depositConfig — making the risky-guest override in
    // effectiveDepositPolicy unreachable in production. The gate must key
    // off whether a deposit was ever configured, not the enabled flag.
    const { useStripe, useElements } = await import("@stripe/react-stripe-js");
    vi.mocked(useStripe).mockReturnValue({
      confirmCardPayment: vi.fn().mockResolvedValue({
        paymentIntent: { id: "pi_test_risky_override" },
      }),
    } as unknown as ReturnType<typeof useStripe>);
    vi.mocked(useElements).mockReturnValue({
      getElement: vi.fn().mockReturnValue({ mount: vi.fn() }),
    } as unknown as ReturnType<typeof useElements>);

    mockApi.publicVenue.guestRisk.mockResolvedValue({
      riskScore: "risky",
      noShowCount: 3,
      requiresDeposit: true,
    });

    mockApi.venues.getPublicConfig.mockResolvedValue({
      name: "The Oak Table",
      slug: "the-oak-table",
      ianaTimezone: "America/New_York",
      currencyCode: "USD",
      operatingHours: null,
      settings: {},
      deposit: {
        enabled: false,
        depositType: "flat",
        amountCents: 5000,
        freeCancellationHours: 24,
        lateCancellationFeePercent: 50,
        noShowFeePercent: 100,
      },
    });
    mockApi.publicVenue.depositIntent.mockResolvedValue({
      clientSecret: "pi_secret_test",
      depositId: "dep-2",
      amountCents: 5000,
      currency: "usd",
    });

    render(
      <BookingWidget venueId="v1" venueSlug="the-oak-table" stripePublishableKey="pk_test_abc" />
    );

    const dateInput = screen.getByLabelText("Date");
    fireEvent.change(dateInput, { target: { value: "2026-05-20" } });

    mockApi.availability.getTimeSlots.mockResolvedValue([
      { time: "2026-05-20T18:00:00", available: true },
    ]);
    fireEvent.click(screen.getByText("Find Available Times"));

    await waitFor(() => expect(screen.getByText("Time")).toBeDefined());
    mockApi.holds.create.mockResolvedValue({
      hold: { id: "hold-1", expiresAt: new Date(Date.now() + 600000).toISOString() },
    });
    fireEvent.click(await screen.findByText(/6:00 PM/i));

    await waitFor(() => expect(screen.getByText("Details")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Risky Guest" } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "risky@example.com" },
    });

    mockApi.holds.confirm.mockResolvedValue({
      id: "res-risky-override",
      status: "CONFIRMED",
      date: "2026-05-20",
      startTime: "18:00",
      partySize: 2,
    });

    fireEvent.click(screen.getByText("Complete Reservation"));

    // Venue's general policy is disabled — the risky-guest override must
    // still route to the payment step.
    await waitFor(() => expect(screen.getByText(/Authorize \$50\.00/)).toBeDefined());
    fireEvent.click(screen.getByText(/Authorize \$50\.00/));

    // Confirmation must show the correct cancellation terms for the deposit
    // actually collected via the override — not the blank/no-deposit case.
    await waitFor(() => expect(screen.getByText("Reservation Confirmed!")).toBeDefined());
    expect(
      screen.getByText(/Free cancellation up to 24 hours before your reservation/)
    ).toBeDefined();
  });

  it("hides cancellation-policy terms on confirmation when the venue's deposit policy is disabled and the guest isn't risky (configured-then-disabled)", async () => {
    // Regression test for #3094: once fetchDepositConfig stops gating on
    // `.enabled`, data.depositConfig becomes non-null for any venue that has
    // ever configured a deposit — even one that later disabled it.
    // ConfirmationView must not render cancellation terms for a booking
    // where no deposit was actually required, even though depositConfig
    // itself is non-null.
    mockApi.publicVenue.guestRisk.mockResolvedValue({
      riskScore: "trusted",
      noShowCount: 0,
      requiresDeposit: false,
    });

    mockApi.venues.getPublicConfig.mockResolvedValue({
      name: "The Oak Table",
      slug: "the-oak-table",
      ianaTimezone: "America/New_York",
      currencyCode: "USD",
      operatingHours: null,
      settings: {},
      deposit: {
        enabled: false,
        depositType: "flat",
        amountCents: 5000,
        freeCancellationHours: 24,
        lateCancellationFeePercent: 50,
        noShowFeePercent: 100,
      },
    });

    render(
      <BookingWidget venueId="v1" venueSlug="the-oak-table" stripePublishableKey="pk_test_abc" />
    );

    const dateInput = screen.getByLabelText("Date");
    fireEvent.change(dateInput, { target: { value: "2026-05-20" } });

    mockApi.availability.getTimeSlots.mockResolvedValue([
      { time: "2026-05-20T18:00:00", available: true },
    ]);
    fireEvent.click(screen.getByText("Find Available Times"));

    await waitFor(() => expect(screen.getByText("Time")).toBeDefined());
    mockApi.holds.create.mockResolvedValue({
      hold: { id: "hold-1", expiresAt: new Date(Date.now() + 600000).toISOString() },
    });
    fireEvent.click(await screen.findByText(/6:00 PM/i));

    await waitFor(() => expect(screen.getByText("Details")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Trusted Guest" } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "trusted@example.com" },
    });

    mockApi.holds.confirm.mockResolvedValue({
      id: "res-no-override",
      status: "CONFIRMED",
      date: "2026-05-20",
      startTime: "18:00",
      partySize: 2,
    });

    fireEvent.click(screen.getByText("Complete Reservation"));

    // Not risky + policy disabled → straight to confirmation, no payment step.
    await waitFor(() => expect(screen.getByText("Reservation Confirmed!")).toBeDefined());
    expect(screen.queryByText(/Free cancellation up to 24 hours/)).toBeNull();
    expect(screen.queryByText("Cancellation Policy")).toBeNull();
  });
});
