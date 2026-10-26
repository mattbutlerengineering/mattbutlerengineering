import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { LapsingGuest, Reservation, Table } from "@mbe/types";
import type { ReservationEvent } from "../hooks/useSSESync.js";
import { localeRuntime } from "./runtime.js";
import esMX from "./catalogs/es-MX.json";
import frCA from "./catalogs/fr-CA.json";
import { ActivityFeed } from "../components/dashboard/ActivityFeed.js";
import { LapsingGuestsWidget } from "../components/dashboard/LapsingGuestsWidget.js";
import { DepositExposureWidget } from "../components/dashboard/DepositExposureWidget.js";
import { ReservationList } from "../components/dashboard/ReservationList.js";
import { StatRow } from "../components/dashboard/StatRow.js";
import { ReservationBlock } from "../components/timeline/ReservationBlock.js";
import { TableStatusMenu } from "../components/timeline/TableStatusMenu.js";
import { TimelineEmptyNight } from "../components/timeline/TimelineEmptyNight.js";
import { TimelineSkeleton } from "../components/timeline/TimelineSkeleton.js";
import { TimelineMobileView } from "../components/timeline/TimelineMobileView.js";
import { TimelineGrid } from "../components/timeline/TimelineGrid.js";
import { CancelReservationDialog } from "../components/timeline/CancelReservationDialog.js";
import { MarkNoShowDialog } from "../components/timeline/MarkNoShowDialog.js";
import { StaffDepositSection } from "../components/timeline/StaffDepositSection.js";
import { ReservationDetails } from "../components/timeline/ReservationDetails.js";
import { ReservationSheet } from "../components/timeline/ReservationSheet.js";
import { EditReservationDrawer } from "../components/timeline/EditReservationDrawer.js";
import { occupiedCaption, statusWord } from "../components/timeline/seat-guest.js";
import { HomePage } from "../pages/HomePage.js";
import { TimelinePage } from "../pages/TimelinePage.js";

// jsdom has no matchMedia; TimelineGrid's useIsMobile reads it on mount.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { name: "Ana" } }) }));
vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({ selectedVenue: null, selectedVenueId: "v1" }),
}));
vi.mock("../hooks/useDashboardStatsQuery.js", () => ({
  useDashboardStatsQuery: () => ({
    reservations: [],
    stats: STATS,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("../hooks/useSSESync.js", () => ({
  useSSEStatus: () => ({ isConnected: true }),
  useSSEEventFeed: () => [],
  useSSESync: () => ({ reconnect: vi.fn() }),
}));
vi.mock("../hooks/useAvailability.js", () => ({
  useAvailabilityConfig: () => ({ data: null }),
  useAvailabilityDays: () => ({ data: undefined }),
}));
vi.mock("../hooks/useGuests.js", () => ({
  useLapsingGuests: () => ({ data: [] }),
  useSendWinBack: () => ({ mutate: vi.fn() }),
  useGuest: () => ({ data: null }),
}));
vi.mock("../hooks/useTimelineData.js", () => ({
  useTimelineData: () => ({
    reservations: [],
    tables: [],
    isLoading: false,
    fetchError: null,
    stats: { total: 0, totalCovers: 0, confirmed: 0, pending: 0 },
    isFromCache: false,
    lastSyncedAt: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("../hooks/useCancellationQuote.js", () => ({
  useCancellationQuote: () => ({ quote: null, isLoading: false }),
}));
vi.mock("../hooks/useDeposits.js", () => ({
  useDepositByReservation: () => ({ data: null, isLoading: false, error: null }),
  useCreateDeposit: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock("../components/availability/TimelineTonight.js", () => ({ TimelineTonight: () => null }));
vi.mock("../components/crm/GuestCard.js", () => ({ GuestCard: () => null }));
vi.mock("../components/crm/GuestLookup.js", () => ({ GuestLookup: () => null }));

const STATS = {
  totalReservations: 3,
  expectedCovers: 9,
  upcomingCount: 1,
  waitlistCount: 2,
  longestWaitMinutes: 4,
  cancellationRate: 10,
  depositAtRiskCount: 1,
  noShowExposureCents: 2500,
};

const RESERVATION = {
  id: "r1",
  date: "2026-05-14",
  startTime: "2026-05-14T18:00:00.000Z",
  endTime: "2026-05-14T20:00:00.000Z",
  partySize: 4,
  status: "CONFIRMED",
  notes: null,
  guestName: "Jane Doe",
  guestEmail: "jane@example.com",
  guestPhone: null,
  guestId: null,
  occasion: null,
  seatingPreference: null,
  tableId: "t1",
  venueId: "v1",
  guest: { visitCount: 2 },
} as unknown as Reservation;

const TABLE = {
  id: "t1",
  name: "Mesa 1",
  tableNumber: "1",
  capacity: 4,
  minCovers: 2,
  maxCovers: 4,
  status: "OCCUPIED",
  isActive: true,
} as unknown as Table;

async function useLocale(tag: "es-MX" | "fr-CA", catalog: unknown) {
  localeRuntime.i18n.addResourceBundle(tag, "translation", catalog, true, true);
  await localeRuntime.i18n.changeLanguage(tag);
}

afterAll(async () => {
  await localeRuntime.i18n.changeLanguage("en-US");
});

describe("home and timeline in es-MX", () => {
  beforeAll(() => useLocale("es-MX", esMX));

  it("translates the dashboard widgets", () => {
    const events = [
      { type: "reservation:created", venueId: "v1", timestamp: new Date().toISOString() },
    ] as unknown as ReservationEvent[];
    const { unmount } = render(<ActivityFeed events={events} isConnected />);
    expect(screen.getByText("Actividad en vivo")).toBeInTheDocument();
    expect(screen.getByText("Nueva reservación creada")).toBeInTheDocument();
    expect(screen.getByText("justo ahora")).toBeInTheDocument();
    unmount();

    const guest = {
      guestId: "g1",
      name: "Jane Doe",
      communicationPreference: "both",
      avgFrequencyDays: 7,
      daysOverdue: 3,
    } as unknown as LapsingGuest;
    render(<LapsingGuestsWidget guests={[guest]} onSendWinBack={vi.fn()} />);
    expect(screen.getByText("Cada 7 días · 3 días de retraso")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enviar invitación para volver a Jane Doe" })
    ).toBeInTheDocument();
  });

  it("translates deposit exposure and the stat row", () => {
    const { unmount } = render(
      <DepositExposureWidget depositAtRiskCount={1} noShowExposureCents={2500} currency="USD" />
    );
    expect(screen.getByText("Exposición de depósitos")).toBeInTheDocument();
    expect(screen.getByText("Depósitos en riesgo")).toBeInTheDocument();
    unmount();

    render(<StatRow stats={STATS as never} />);
    expect(screen.getByText("Cubiertos esperados")).toBeInTheDocument();
    expect(screen.getByText("Lista de espera")).toBeInTheDocument();
  });

  it("translates today's reservations with a short-form status badge", () => {
    render(<ReservationList reservations={[RESERVATION]} isLoading={false} />);
    expect(screen.getByText("Reservaciones de hoy")).toBeInTheDocument();
    expect(screen.getByText("Grupo de 4")).toBeInTheDocument();
    expect(screen.getByText("Confirmada")).toBeInTheDocument();
  });

  it("translates the Home page", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "Panel" })).toBeInTheDocument();
    expect(screen.getByText("Bienvenido de nuevo, Ana")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver plano de sala" })).toBeInTheDocument();
  });

  it("translates the reservation block, with the visit ordinal, and marks it truncatable", () => {
    render(<ReservationBlock reservation={RESERVATION} style={{ left: 0, width: 100 }} isSeated />);
    const block = screen.getByTestId("reservation-block-r1");
    expect(block.getAttribute("aria-label")).toMatch(
      /^Jane Doe, grupo de 4, .*, confirmed|^Jane Doe, grupo de 4/
    );
    expect(block.getAttribute("aria-label")).toContain("2.ª visita");
    expect(block.getAttribute("aria-label")).toContain("sentados");
    expect(block.querySelector("[data-truncate]")).not.toBeNull();
  });

  it("translates the table status menu", () => {
    render(
      <TableStatusMenu tableId="t1" tableName="Mesa 1" status="OCCUPIED" onChange={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "Mesa 1: Ocupada. Cambiar estado" })).toBeVisible();
  });

  it("translates the quiet night and the loading skeleton", () => {
    const { unmount } = render(
      <TimelineEmptyNight variant="today" dateLabel="" onWalkIn={vi.fn()} onToday={vi.fn()} />
    );
    expect(screen.getByText("Todo tranquilo por ahora.")).toBeInTheDocument();
    unmount();
    render(<TimelineSkeleton />);
    expect(screen.getByText("Cargando la cuadrícula de esta noche…")).toBeInTheDocument();
  });

  it("translates the phone list: filters, empty state and card", () => {
    const { unmount } = render(
      <TimelineMobileView reservations={[]} tables={[]} onReservationClick={vi.fn()} />
    );
    expect(screen.getByText("Todas")).toBeInTheDocument();
    expect(screen.getByText("Próximas")).toBeInTheDocument();
    expect(screen.getByText("No hay reservaciones")).toBeInTheDocument();
    unmount();

    render(
      <TimelineMobileView
        reservations={[RESERVATION]}
        tables={[TABLE]}
        onReservationClick={vi.fn()}
        seatedIds={new Set(["r1"])}
      />
    );
    const card = screen.getByTestId("reservation-block-r1");
    expect(card.getAttribute("aria-label")).toContain("grupo de 4");
    expect(card.getAttribute("aria-label")).toContain("mesa 1");
    expect(within(card).getByText("Confirmada")).toBeInTheDocument();
  });

  it("translates the grid headings", () => {
    render(
      <TimelineGrid
        tables={[TABLE]}
        reservations={[]}
        date="2026-05-14"
        startHour={11}
        endHour={13}
      />
    );
    expect(screen.getByRole("grid", { name: "Cronograma de reservaciones" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Mesas" })).toBeInTheDocument();
    expect(screen.getByText("4 invitados", { exact: false })).toBeInTheDocument();
  });

  it("translates the cancel and no-show dialogs", () => {
    const { unmount } = render(
      <CancelReservationDialog
        reservationId="r1"
        guestName="Jane Doe"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("dialog", { name: "Cancelar reservación" })).toBeInTheDocument();
    expect(screen.getByText("Jane Doe").tagName).toBe("STRONG");
    expect(screen.getByRole("button", { name: "Conservar reservación" })).toBeInTheDocument();
    unmount();

    render(<MarkNoShowDialog guestName="Jane Doe" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Marcar inasistencia" })).toBeInTheDocument();
  });

  it("translates the staff deposit section", () => {
    render(
      <StaffDepositSection
        reservationId="r1"
        existingDeposit={
          {
            amountCents: 2500,
            currency: "usd",
            status: "held",
            postCaptureRefundCents: null,
          } as never
        }
      />
    );
    expect(screen.getByText("Depósito")).toBeInTheDocument();
    expect(screen.getByText(/Autorizado/)).toBeInTheDocument();
  });

  it("translates the detail panel and the tablet sheet", () => {
    const props = {
      reservation: RESERVATION,
      tables: [TABLE],
      seated: true,
      now: new Date("2026-05-14T18:30:00.000Z"),
      onEdit: vi.fn(),
      onSeat: vi.fn(),
      onCancel: vi.fn(),
      onMarkNoShow: vi.fn(),
    };
    const { unmount } = render(<ReservationDetails {...props} />);
    expect(screen.getByText("Tamaño del grupo")).toBeInTheDocument();
    expect(screen.getByText("4 invitados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar reservación" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marcar inasistencia" })).toBeInTheDocument();
    unmount();

    render(
      <ReservationSheet
        {...props}
        open
        onClose={vi.fn()}
        expanded={false}
        onToggleExpanded={vi.fn()}
      />
    );
    expect(screen.getByText("grupo de 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Más/ })).toBeInTheDocument();
  });

  it("translates the seat-guest sentences", () => {
    const t = localeRuntime.i18n.t.bind(localeRuntime.i18n);
    expect(statusWord(RESERVATION, true, t)).toBe("Sentados");
    expect(statusWord(RESERVATION, false, t)).toBe("Confirmada");
    const caption = occupiedCaption(
      { ...RESERVATION, status: "PENDING", startTime: "2999-01-01T00:00:00.000Z" } as Reservation,
      TABLE,
      new Date(),
      t
    );
    expect(caption).toBe("Mesa 1 sigue ocupada: libérala o cambia de mesa al grupo.");
  });

  it("translates the edit drawer", () => {
    render(
      <EditReservationDrawer
        reservation={RESERVATION}
        tables={[TABLE]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Hora de inicio")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeInTheDocument();
  });

  it("translates the Timeline page", () => {
    render(
      <MemoryRouter>
        <TimelinePage />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "Cronograma" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Día anterior" })).toBeInTheDocument();
    expect(screen.getByText("Aún no hay mesas.")).toBeInTheDocument();
  });
});

describe("home and timeline in fr-CA", () => {
  beforeAll(() => useLocale("fr-CA", frCA));

  it("translates the dashboard widgets", () => {
    render(<ReservationList reservations={[RESERVATION]} isLoading={false} />);
    expect(screen.getByText("Réservations du jour")).toBeInTheDocument();
    expect(screen.getByText("Groupe de 4")).toBeInTheDocument();
    expect(screen.getByText("Confirmée")).toBeInTheDocument();
  });

  it("translates the visit ordinal and the table menu", () => {
    const { unmount } = render(
      <ReservationBlock
        reservation={{ ...RESERVATION, guest: { visitCount: 1 + 1 } } as Reservation}
        style={{ left: 0, width: 100 }}
      />
    );
    expect(screen.getByTestId("reservation-block-r1").getAttribute("aria-label")).toContain(
      "2e visite"
    );
    unmount();
    render(<TableStatusMenu tableId="t1" tableName="Table 1" status="DIRTY" onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Table 1 : À nettoyer. Modifier le statut" })
    ).toBeVisible();
  });

  it("translates the Timeline page", () => {
    render(
      <MemoryRouter>
        <TimelinePage />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "Chronologie" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Jour suivant" })).toBeInTheDocument();
    expect(screen.getByText("Aucune table pour l'instant.")).toBeInTheDocument();
  });
});
