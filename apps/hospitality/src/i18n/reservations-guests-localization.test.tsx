import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { Guest, Reservation, Table, WaitlistEntry } from "@mbe/types";
import { localeRuntime } from "./runtime.js";
import esMX from "./catalogs/es-MX.json";
import frCA from "./catalogs/fr-CA.json";
import { ReservationsPage } from "../pages/ReservationsPage.js";
import { GuestsPage } from "../pages/GuestsPage.js";
import { WaitlistPage } from "../pages/WaitlistPage.js";
import { NewReservationDialog } from "../components/reservations/NewReservationDialog.js";
import { GuestTable } from "../components/crm/GuestTable.js";
import { GuestHistoryStrip } from "../components/crm/GuestHistoryStrip.js";
import { pickAnnouncement } from "../components/crm/guest-lookup-rows.js";
import type { UseGuestDirectoryResult } from "../hooks/useGuestDirectory.js";

const GUEST = {
  id: "g1",
  venueId: "venue-1",
  name: "Alice Johnson",
  email: "alice@example.com",
  phone: "+15551234567",
  notes: null,
  visitCount: 12,
  noShowCount: 2,
  riskScore: "standard",
  lifetimeSpend: null,
  lastVisit: null,
  tags: [],
  dietaryRestrictions: ["shellfish allergy"],
  communicationPreference: "both",
  staffNotes: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
} as unknown as Guest;

const RESERVATION = {
  id: "r1",
  date: "2026-01-15",
  startTime: "2026-01-15T18:00:00Z",
  endTime: "2026-01-15T20:00:00Z",
  partySize: 2,
  status: "CONFIRMED",
  notes: null,
  guestName: "Alice Johnson",
  guest: { visitCount: 3 },
  tableId: "missing",
  table: null,
} as unknown as Reservation;

const TABLE = {
  id: "t1",
  name: "T1",
  capacity: 4,
  minCovers: 1,
  maxCovers: null,
  isActive: true,
  status: "AVAILABLE",
} as unknown as Table;

const ENTRY = {
  id: "wl-1",
  venueId: "venue-1",
  partySize: 4,
  guestName: "Jane Doe",
  guestPhone: "+15551234567",
  position: 1,
  estimatedWaitMinutes: 15,
  status: "waiting",
  notifiedAt: null,
} as unknown as WaitlistEntry;

vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({ selectedVenueId: "venue-1" }),
}));
// Stable references: the page re-runs an effect on `data` identity, so a fresh array per
// render would loop forever.
const DISPLAY = {
  data: [RESERVATION],
  stats: { total: 1, confirmed: 1, pending: 0, cancelled: 0 },
  filteredData: [RESERVATION],
  isLoading: false,
  error: null,
  refetch: vi.fn(),
};
vi.mock("../hooks/useReservationDisplay.js", () => ({ useReservationDisplay: () => DISPLAY }));
const TABLES_RESULT = { data: [TABLE], isLoading: false };
vi.mock("../hooks/useTables.js", () => ({ useTables: () => TABLES_RESULT }));
vi.mock("../hooks/useReservations.js", () => ({
  useCreateReservation: () => ({ mutateAsync: vi.fn() }),
  useReservations: () => ({ data: [], isLoading: false }),
}));
vi.mock("../hooks/useWaitlist.js", () => ({
  useWaitlist: () => ({ data: [ENTRY], isLoading: false, error: null, refetch: vi.fn() }),
  useCreateWaitlistEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useNotifyWaitlistEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCancelWaitlistEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSeatWaitlistEntry: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../hooks/useApiClient.js", () => ({ useApiClient: () => ({ reservations: {} }) }));
vi.mock("../hooks/useStaffBookingCheck.js", () => ({
  useStaffBookingCheck: () => ({ phase: "idle", verdict: null }),
}));
const TONIGHT_RESULT = { serviceDate: null, rules: [], waitlistClosed: false };
vi.mock("../hooks/useStaffTonight.js", () => ({ useStaffTonight: () => TONIGHT_RESULT }));
vi.mock("../hooks/useVenueTeam.js", () => ({
  useVenueTeam: () => ({ data: null, isLoading: false, error: null }),
}));
vi.mock("../hooks/useClosures.js", () => ({
  useReopenClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/useOpenTimes.js", () => ({
  useOpenTimes: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock("../hooks/useGuestLookup.js", () => ({
  useGuestLookup: () => ({ rows: [], hasMore: false, isLoading: false, failed: false, query: "" }),
}));

const DIRECTORY = {
  guests: [GUEST],
  segments: [{ name: "At Risk", description: "", count: 3 }],
  isLoading: false,
  error: null,
  refetch: vi.fn(),
  totalCount: 40,
  page: 1,
  totalPages: 4,
  setPage: vi.fn(),
  searchQuery: "",
  setSearchQuery: vi.fn(),
  isSearchActive: false,
  selectedGuestId: null,
  selectedGuest: null,
  selectGuest: vi.fn(),
  clearSelection: vi.fn(),
  addGuest: vi.fn(),
  updateGuest: vi.fn(),
  isAddingGuest: false,
  isUpdatingGuest: false,
} as UseGuestDirectoryResult;

async function useLocale(tag: "es-MX" | "fr-CA", catalog: unknown) {
  localeRuntime.i18n.addResourceBundle(tag, "translation", catalog, true, true);
  await localeRuntime.i18n.changeLanguage(tag);
}

afterAll(async () => {
  await localeRuntime.i18n.changeLanguage("en-US");
});

describe("reservations and guests in es-MX", () => {
  beforeAll(() => useLocale("es-MX", esMX));

  it("translates the reservations page", () => {
    render(
      <MemoryRouter>
        <ReservationsPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "Reservas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva reserva" })).toBeInTheDocument();
    expect(screen.getByText("Confirmada")).toBeInTheDocument();
    expect(screen.getByText("Visita n.º 3")).toBeInTheDocument();
    expect(screen.getByText("Mesa no disponible")).toBeInTheDocument();
    expect(screen.getByText("1 reserva mostrada")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ver la reserva de Alice Johnson en la cronología" })
    ).toBeInTheDocument();
  });

  it("translates the guests page, its segments and table", () => {
    render(
      <ToastProvider>
        <GuestsPage _useGuestDirectory={() => DIRECTORY} />
      </ToastProvider>
    );
    expect(screen.getByRole("heading", { name: "Clientes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar cliente" })).toBeInTheDocument();
    expect(screen.getByText("En riesgo")).toBeInTheDocument();
    expect(screen.getByText("Mostrando 1 de 40 clientes")).toBeInTheDocument();
    expect(screen.getByText("Página 1 de 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Página siguiente" })).toBeInTheDocument();
  });

  it("translates the guest table rows", () => {
    render(<GuestTable guests={[GUEST]} selectedGuestId={null} onRowClick={vi.fn()} />);
    expect(screen.getByText("Última visita")).toBeInTheDocument();
    expect(screen.getByText("Nunca")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ver los detalles de Alice Johnson" })
    ).toBeInTheDocument();
  });

  it("translates the guest history strip and the pick announcement", () => {
    render(<GuestHistoryStrip guest={GUEST} mode="linked" onClear={vi.fn()} />);
    expect(screen.getByText("Usando el perfil de Alice Johnson")).toBeInTheDocument();
    expect(screen.getByText("12 visitas")).toBeInTheDocument();
    expect(screen.getByText("Alergia: shellfish allergy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar a Alice Johnson" })).toBeInTheDocument();
    expect(pickAnnouncement("linked", GUEST)).toBe(
      "Usando el perfil de Alice Johnson — 12 visitas, 2 inasistencias. Alergia: shellfish allergy."
    );
  });

  it("translates the new reservation dialog", () => {
    render(
      <NewReservationDialog
        tables={[TABLE]}
        venueId="venue-1"
        defaultDate="2026-01-15"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Nueva reserva")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear reserva" })).toBeInTheDocument();
    expect(screen.getByText("Preferencia de asiento")).toBeInTheDocument();
    expect(screen.getByText("Comensales")).toBeInTheDocument();
  });

  it("translates the waitlist page", () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <WaitlistPage />
        </ToastProvider>
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "Lista de espera" })).toBeInTheDocument();
    expect(screen.getByText("Grupo de 4")).toBeInTheDocument();
    expect(screen.getByText("~15 min")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sentar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notificar" })).toBeInTheDocument();
  });
});

describe("reservations and guests in fr-CA", () => {
  beforeAll(() => useLocale("fr-CA", frCA));

  it("translates the reservations page", () => {
    render(
      <MemoryRouter>
        <ReservationsPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: "Nouvelle réservation" })).toBeInTheDocument();
    expect(screen.getByText("Confirmée")).toBeInTheDocument();
    expect(screen.getByText("3e visite")).toBeInTheDocument();
    expect(screen.getByText("1 réservation affichée")).toBeInTheDocument();
  });

  it("translates the waitlist and the guest strip", () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <WaitlistPage />
        </ToastProvider>
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "Liste d’attente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Installer" })).toBeInTheDocument();

    render(<GuestHistoryStrip guest={GUEST} mode="recognised" onClear={vi.fn()} />);
    expect(screen.getByText("Client reconnu : Alice Johnson")).toBeInTheDocument();
    expect(screen.getByText("2 absences")).toBeInTheDocument();
  });
});
