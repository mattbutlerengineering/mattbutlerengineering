import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DepositConfig, Reservation, TimeSlot } from "@mbe/types";
import {
  WidgetLocaleScope,
  WIDGET_LOCALE_STORAGE_KEY,
} from "../components/booking-widget/WidgetLocaleScope.js";
import { BookingWidget } from "../components/booking-widget/BookingWidget.js";
import { TimeSlotPicker } from "../components/booking-widget/TimeSlotPicker.js";
import { GuestDetailsForm } from "../components/booking-widget/GuestDetailsForm.js";
import { PaymentStep } from "../components/booking-widget/PaymentStep.js";
import type { BookingWidgetApiClient } from "../components/booking-widget/PaymentStep.js";
import { ConfirmationView } from "../components/booking-widget/ConfirmationView.js";
import { WaitlistJoinView } from "../components/booking-widget/WaitlistJoinView.js";
import { WaitlistConfirmationView } from "../components/booking-widget/WaitlistConfirmationView.js";
import { PublicBookingPage } from "../pages/PublicBookingPage.js";
import { ManageReservationPage } from "../pages/ManageReservationPage.js";
import { localeRuntime } from "./runtime.js";

const { mockGetBySlug, mockManage, mockSearchParams } = vi.hoisted(() => ({
  mockGetBySlug: vi.fn(),
  mockManage: vi.fn(),
  mockSearchParams: new URLSearchParams(),
}));

vi.mock("react-router", () => ({
  useParams: () => ({ venueSlug: "oak" }),
  useSearchParams: () => [mockSearchParams, vi.fn()],
}));
vi.mock("../hooks/usePublicApiClient.js", () => ({
  usePublicApiClient: () => ({
    venues: { getBySlug: mockGetBySlug },
    reservations: { manageReservation: mockManage },
  }),
}));
vi.mock("../components/booking-widget/useBookingFlow.js", () => ({
  useBookingFlow: () => ({
    state: "date-party",
    data: { venueConfig: null, partySize: 2, selectedDate: null, selectedEndDate: null },
    actions: {},
    stepKeys: ["date-party", "time-slot", "guest-details"],
    currentStepIndex: 0,
  }),
}));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardElement: () => <div />,
  useStripe: () => null,
  useElements: () => null,
}));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: vi.fn().mockResolvedValue(null) }));

const api = {
  publicVenue: { recognizeGuest: vi.fn(), joinWaitlist: vi.fn() },
  holds: { getSessionId: () => "s1" },
} as unknown as BookingWidgetApiClient;

const TOMORROW = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const SLOT: TimeSlot = { time: `${TOMORROW}T19:00:00.000Z`, available: true };

const DEPOSIT: DepositConfig = {
  enabled: true,
  depositType: "flat",
  amountCents: 10000,
  currency: "usd",
  freeCancellationHours: 24,
  lateCancellationFeePercent: 50,
  noShowFeePercent: 100,
};

const RESERVATION = {
  id: "res_12345678",
  date: TOMORROW,
  startTime: SLOT.time,
  endTime: SLOT.time,
  partySize: 2,
  guestName: "Ada",
  guestEmail: "ada@example.com",
  notes: "Window seat",
} as unknown as Reservation;

type Tag = "es-MX" | "fr-CA";

function withQuery(ui: ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

function renderIn(tag: Tag, ui: ReactNode) {
  localStorage.setItem(WIDGET_LOCALE_STORAGE_KEY, tag);
  return render(withQuery(<WidgetLocaleScope>{ui}</WidgetLocaleScope>));
}

beforeEach(() => {
  localStorage.clear();
  mockSearchParams.delete("token");
});

describe.each([
  {
    tag: "es-MX" as const,
    widgetTitle: "Haz una reserva",
    partySize: "Número de personas",
    dinner: "Cena",
    guests: "2 personas",
    complete: "Completar reserva",
    deposit: "Depósito requerido",
    terms: /Cancelación gratuita hasta 24 horas antes de tu reserva/,
    confirmed: "¡Reserva confirmada!",
    acknowledgement: "Anotado. Ya está en tu reserva para el equipo.",
    waitlistJoin: "Unirse a la lista de espera",
    waitlistAdded: "Agregado a la lista de espera",
    tagline: "Reserva tu mesa en línea",
    details: "Detalles de la reserva",
  },
  {
    tag: "fr-CA" as const,
    widgetTitle: "Faire une réservation",
    partySize: "Nombre de personnes",
    dinner: "Souper",
    guests: "2 convives",
    complete: "Confirmer la réservation",
    deposit: "Dépôt requis",
    terms: /Annulation gratuite jusqu’à 24 heures avant votre réservation/,
    confirmed: "Réservation confirmée!",
    acknowledgement: "C’est noté. C’est inscrit à votre réservation pour l’équipe.",
    waitlistJoin: "Rejoindre la liste d’attente",
    waitlistAdded: "Ajouté à la liste d’attente",
    tagline: "Réservez votre table en ligne",
    details: "Détails de la réservation",
  },
])("guest booking in $tag", (c) => {
  it("translates the widget header and the date & party step", async () => {
    renderIn(c.tag, <BookingWidget venueId="v1" venueSlug="oak" />);
    expect(await screen.findByRole("heading", { name: c.widgetTitle })).toBeInTheDocument();
    expect(screen.getByText(c.partySize)).toBeInTheDocument();
  });

  it("translates the time step", async () => {
    renderIn(
      c.tag,
      <TimeSlotPicker
        slots={[SLOT]}
        selectedSlot={null}
        isLoading={false}
        error={null}
        onSelectSlot={vi.fn()}
        onBack={vi.fn()}
        date={TOMORROW}
        partySize={2}
        venueTimezone="UTC"
      />
    );
    expect(await screen.findByText(c.dinner)).toBeInTheDocument();
    expect(screen.getByText(c.guests)).toBeInTheDocument();
  });

  it("translates the details step", async () => {
    renderIn(
      c.tag,
      <GuestDetailsForm
        slot={SLOT}
        hold={null}
        date={TOMORROW}
        partySize={2}
        isLoading={false}
        error={null}
        onSubmit={vi.fn()}
        onBack={vi.fn()}
        api={api}
        venueTimezone="UTC"
      />
    );
    expect(await screen.findByRole("button", { name: c.complete })).toBeInTheDocument();
  });

  it("translates the payment step and its cancellation policy", async () => {
    renderIn(
      c.tag,
      <PaymentStep
        api={api}
        depositConfig={DEPOSIT}
        partySize={2}
        reservationId="r1"
        venueSlug="oak"
        stripePublishableKey="pk_test"
        onSuccess={vi.fn()}
      />
    );
    expect(await screen.findByText(c.deposit)).toBeInTheDocument();
    expect(screen.getByText(c.terms)).toBeInTheDocument();
  });

  it("translates the confirmation step", async () => {
    renderIn(
      c.tag,
      <ConfirmationView reservation={RESERVATION} onNewBooking={vi.fn()} venueTimezone="UTC" />
    );
    expect(await screen.findByText(c.confirmed)).toBeInTheDocument();
    expect(screen.getByText(c.acknowledgement)).toBeInTheDocument();
  });

  it("translates the waitlist steps", async () => {
    renderIn(
      c.tag,
      <>
        <WaitlistJoinView
          requestedDate={TOMORROW}
          partySize={2}
          venueSlug="oak"
          venueId="v1"
          api={api}
          onJoined={vi.fn()}
          onBack={vi.fn()}
        />
        <WaitlistConfirmationView position={3} estimatedWaitMinutes={20} onNewBooking={vi.fn()} />
      </>
    );
    expect(await screen.findByRole("button", { name: c.waitlistJoin })).toBeInTheDocument();
    expect(screen.getByText(c.waitlistAdded)).toBeInTheDocument();
  });

  it("translates the public booking page", async () => {
    localStorage.setItem(WIDGET_LOCALE_STORAGE_KEY, c.tag);
    mockGetBySlug.mockResolvedValue({
      id: "v1",
      name: "Oak",
      slug: "oak",
      ianaTimezone: "UTC",
      operatingHours: null,
    });
    render(withQuery(<PublicBookingPage />));
    expect(await screen.findByText(c.tagline)).toBeInTheDocument();
  });

  it("translates the manage reservation page", async () => {
    localStorage.setItem(WIDGET_LOCALE_STORAGE_KEY, c.tag);
    mockSearchParams.set("token", "tok");
    mockManage.mockResolvedValue({
      reservation: { ...RESERVATION, status: "CONFIRMED", notes: null },
      venue: { id: "v1", name: "Oak", slug: "oak", ianaTimezone: "UTC" },
    });
    render(withQuery(<ManageReservationPage />));
    expect(await screen.findByText(c.details)).toBeInTheDocument();
  });
});

describe("widget locale and the document", () => {
  it("switching the widget locale leaves <html lang> alone", async () => {
    await localeRuntime.changeLocale("en-US");
    localStorage.clear();
    document.documentElement.setAttribute("lang", "en-US");
    render(
      withQuery(
        <WidgetLocaleScope>
          <BookingWidget venueId="v1" venueSlug="oak" />
        </WidgetLocaleScope>
      )
    );
    fireEvent.click(await screen.findByRole("button", { name: /Language/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Español/ }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Haz una reserva" })).toBeInTheDocument()
    );
    expect(document.documentElement.lang).toBe("en-US");
  });
});
