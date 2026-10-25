import { describe, it, expect, vi, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { localeRuntime } from "./runtime.js";
import esMX from "./catalogs/es-MX.json";
import frCA from "./catalogs/fr-CA.json";
import { ProfilePage } from "../pages/ProfilePage.js";
import { SettingsPage } from "../pages/SettingsPage.js";
import { AdminPage } from "../pages/AdminPage.js";
import { BookingWidgetDemoPage } from "../pages/BookingWidgetDemoPage.js";
import { NotFoundPage } from "../pages/NotFoundPage.js";
import { SetupHoursPage } from "../pages/SetupHoursPage.js";
import { evaluateCancellationQuote } from "../hooks/useCancellationQuote.js";
import { OfflineBanner } from "../components/OfflineBanner.js";

const USER = {
  id: "u1",
  name: "Alice Johnson",
  email: "alice@example.com",
  picture: null,
  emailVerified: true,
  preferences: { theme: "dark" },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
};

vi.mock("@mbe/auth/react", () => ({
  useAuth: () => ({ user: { raw: {} }, isLoading: false, signOut: vi.fn() }),
}));
const CURRENT_USER = { data: USER, isLoading: false, error: null, refetch: vi.fn() };
const USERS = {
  data: [USER],
  pagination: { total: 1, totalPages: 1 },
  isLoading: false,
  error: null,
  refetch: vi.fn(),
};
vi.mock("../hooks/useUsers.js", () => ({
  useCurrentUser: () => CURRENT_USER,
  useUpdateCurrentUser: () => ({ mutateAsync: vi.fn() }),
  useUpdatePreferences: () => ({ mutateAsync: vi.fn() }),
  useUsers: () => USERS,
}));
vi.mock("../hooks/use-theme", () => ({ useTheme: () => ({ theme: "system", setTheme: vi.fn() }) }));
vi.mock("../components/LanguageRegionCard.js", () => ({ LanguageRegionCard: () => null }));
vi.mock("../hooks/useVenues.js", () => ({
  useVenues: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useUpdateVenue: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../hooks/useVenueTeam.js", () => ({
  useVenueTeam: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }),
  useSetTeamRole: () => ({ mutateAsync: vi.fn() }),
  useSetHostEmergencyClose: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => ({ selectedVenue: null, selectedVenueId: null }),
}));
vi.mock("../components/booking-widget", () => ({
  BookingWidget: () => null,
  WidgetLocaleScope: ({ children }: { children: unknown }) => children,
  hasOperatingHours: () => false,
}));
vi.mock("../components/venue-onboarding/OperatingHoursStep.js", () => ({
  OperatingHoursStep: () => null,
  validateOperatingHours: () => null,
}));

async function useLocale(tag: "es-MX" | "fr-CA", catalog: unknown) {
  localeRuntime.i18n.addResourceBundle(tag, "translation", catalog, true, true);
  await localeRuntime.i18n.changeLanguage(tag);
}

afterAll(async () => {
  await localeRuntime.i18n.changeLanguage("en-US");
});

interface Expected {
  readonly tag: "es-MX" | "fr-CA";
  readonly catalog: unknown;
  readonly profileEdit: string;
  readonly profileAgo: string;
  readonly settingsTitle: string;
  readonly settingsAppearance: string;
  readonly adminUsers: string;
  readonly adminShown: string;
  readonly widgetTitle: string;
  readonly widgetFeature: string;
  readonly notFoundBack: string;
  readonly hoursTitle: string;
  readonly offline: string;
  readonly lateFee: string;
}

const CASES: readonly Expected[] = [
  {
    tag: "es-MX",
    catalog: esMX,
    profileEdit: "Editar perfil",
    profileAgo: "hace 5 min",
    settingsTitle: "Configuración",
    settingsAppearance: "Apariencia",
    adminUsers: "Usuarios totales",
    adminShown: "1 usuario mostrado",
    widgetTitle: "Widget de reservas",
    widgetFeature: "Confirmación instantánea",
    notFoundBack: "Volver al servicio de esta noche",
    hoursTitle: "Horario de atención",
    offline: "Mostrando datos en caché de la última sincronización",
    lateFee: "Cargo por cancelación tardía:",
  },
  {
    tag: "fr-CA",
    catalog: frCA,
    profileEdit: "Modifier le profil",
    profileAgo: "il y a 5 min",
    settingsTitle: "Paramètres",
    settingsAppearance: "Apparence",
    adminUsers: "Total des utilisateurs",
    adminShown: "1 utilisateur affiché",
    widgetTitle: "Widget de réservation",
    widgetFeature: "Confirmation instantanée",
    notFoundBack: "Retour au service de ce soir",
    hoursTitle: "Heures d'ouverture",
    offline: "Affichage des données en cache de la dernière synchronisation",
    lateFee: "Frais d'annulation tardive :",
  },
];

describe.each(CASES)("staff pages in $tag", (c) => {
  it("translates the profile page", async () => {
    await useLocale(c.tag, c.catalog);
    render(<ProfilePage />);
    expect(screen.getByRole("button", { name: c.profileEdit })).toBeInTheDocument();
    expect(screen.getAllByText(c.profileAgo).length).toBeGreaterThan(0);
  });

  it("translates the settings page", async () => {
    await useLocale(c.tag, c.catalog);
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: c.settingsTitle })).toBeInTheDocument();
    expect(screen.getByText(c.settingsAppearance)).toBeInTheDocument();
  });

  it("translates the admin page", async () => {
    await useLocale(c.tag, c.catalog);
    render(<AdminPage />);
    expect(screen.getByText(c.adminUsers)).toBeInTheDocument();
    expect(screen.getByText(c.adminShown)).toBeInTheDocument();
  });

  it("translates the booking widget demo page", async () => {
    await useLocale(c.tag, c.catalog);
    render(
      <MemoryRouter>
        <BookingWidgetDemoPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: c.widgetTitle })).toBeInTheDocument();
    expect(screen.getByText(c.widgetFeature)).toBeInTheDocument();
  });

  it("translates the not-found, operating hours and offline surfaces", async () => {
    await useLocale(c.tag, c.catalog);
    render(
      <MemoryRouter>
        <NotFoundPage />
        <SetupHoursPage />
        <OfflineBanner lastSyncedAt={undefined} />
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: c.notFoundBack })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: c.hoursTitle })).toBeInTheDocument();
    expect(screen.getByText(c.offline)).toBeInTheDocument();
  });

  it("labels the cancellation fee quote in the dashboard locale", async () => {
    await useLocale(c.tag, c.catalog);
    const NOW = new Date("2026-06-20T18:00:00Z");
    const quote = evaluateCancellationQuote(
      {
        depositAmountCents: 5000,
        freeCancellationHours: 2,
        lateCancellationFeePercent: 50,
        noShowFeePercent: 100,
      },
      new Date(NOW.getTime() + 60 * 60 * 1000),
      "usd",
      NOW
    );
    expect(quote?.label).toContain(c.lateFee);
  });
});
