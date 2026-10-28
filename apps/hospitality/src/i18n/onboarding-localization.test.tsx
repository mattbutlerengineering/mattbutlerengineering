import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { localeRuntime } from "./runtime.js";
import esMX from "./catalogs/es-MX.json";
import frCA from "./catalogs/fr-CA.json";
import { WelcomeStep } from "../components/venue-onboarding/WelcomeStep.js";
import { LocationTimeStep } from "../components/venue-onboarding/LocationTimeStep.js";
import { OperatingHoursStep } from "../components/venue-onboarding/OperatingHoursStep.js";
import { SettingsStep, RECOMMENDED_SETTINGS } from "../components/venue-onboarding/SettingsStep.js";
import { FloorPlanStep } from "../components/venue-onboarding/FloorPlanStep.js";
import { LaunchStep } from "../components/venue-onboarding/LaunchStep.js";
import { LaunchStagePanel } from "../components/venue-onboarding/LaunchStagePanel.js";
import { VerticalStepRail } from "../components/venue-onboarding/VerticalStepRail.js";
import { StepIndicator } from "../components/venue-onboarding/StepIndicator.js";
import { validateBasicInfo } from "../components/venue-onboarding/BasicInfoStep.js";
import { validateLocationTime } from "../components/venue-onboarding/LocationTimeStep.js";
import { validateOperatingHours } from "../components/venue-onboarding/OperatingHoursStep.js";
import {
  EMPTY_FLOOR_PLAN_DRAFT,
  type FloorPlanDraft,
} from "../components/venue-onboarding/floor-plan-draft.js";
import { draftFromTemplate } from "../components/venue-onboarding/floor-plan-templates.js";
import { INITIAL_LAUNCH_PROGRESS } from "../components/venue-onboarding/launch-sequence.js";

// The step's canvas draws the chosen room's zones (#7256), and SectionZone
// reaches for Konva primitives (Label/Tag) and a texture loader this suite has
// no business standing up — stub it, as the floor-plan suites do.
vi.mock("../components/floor-plan/SectionZone.js", () => ({
  SectionZone: ({ zone }: { zone: { id: string; name: string } }) => (
    <div data-testid={`section-zone-${zone.id}`}>{zone.name}</div>
  ),
}));

vi.mock("../components/floor-plan/WallShape.js", () => ({
  WallShape: ({ wall }: { wall: { id: string } }) => <div data-testid={`wall-shape-${wall.id}`} />,
}));

// FloorPlanStep imports the Konva-backed canvas; the picker under test never renders it.
vi.mock("react-konva", () => ({
  Stage: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Layer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Group: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Rect: () => null,
  Circle: () => null,
  Line: () => null,
  Path: () => null,
  Label: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Tag: () => null,
  Text: () => null,
}));

const RESTAURANT_DRAFT: FloorPlanDraft = draftFromTemplate("fine-dining", "cozy");

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

const noop = () => undefined;

interface Expectations {
  tag: "es-MX" | "fr-CA";
  catalog: Record<string, unknown>;
  welcomeHeading: string;
  venueNameLabel: string;
  currencyLabel: string;
  currencyOption: string;
  currencyRequired: string;
  closedLabel: string;
  slugRequired: string;
  hoursAtLeastOne: string;
  recommendedButton: string;
  floorPlanHeading: string;
  roomCard: string;
  roomSizeLabel: string;
  launchButton: string;
  launchPanelLabel: string;
  railHours: string;
  wizardProgress: string;
}

const CASES: readonly Expectations[] = [
  {
    tag: "es-MX",
    catalog: esMX,
    welcomeHeading: "Démosle a tu local un hogar en la plataforma",
    venueNameLabel: "Nombre del local",
    currencyLabel: "Moneda",
    currencyOption: "MXN - peso mexicano",
    currencyRequired: "La moneda es obligatoria",
    closedLabel: "Cerrado",
    slugRequired: "El identificador es obligatorio",
    hoursAtLeastOne: "Al menos un día debe estar abierto",
    recommendedButton: "Usar ajustes recomendados",
    floorPlanHeading: "Plano del salón",
    roomCard: "Alta cocina",
    roomSizeLabel: "Tamaño del salón",
    launchButton: "Lanzar local",
    launchPanelLabel: "Progreso del lanzamiento",
    railHours: "Horario",
    wizardProgress: "Progreso del asistente",
  },
  {
    tag: "fr-CA",
    catalog: frCA,
    welcomeHeading: "Donnons à votre établissement une place sur la plateforme",
    venueNameLabel: "Nom de l’établissement",
    currencyLabel: "Devise",
    currencyOption: "MXN - peso mexicain",
    currencyRequired: "La devise est obligatoire",
    closedLabel: "Fermé",
    slugRequired: "L’identifiant est obligatoire",
    hoursAtLeastOne: "Au moins un jour doit être ouvert",
    recommendedButton: "Utiliser les paramètres recommandés",
    floorPlanHeading: "Plan de salle",
    roomCard: "Gastronomique",
    roomSizeLabel: "Taille de la salle",
    launchButton: "Lancer l’établissement",
    launchPanelLabel: "Progression du lancement",
    railHours: "Heures",
    wizardProgress: "Progression de l’assistant",
  },
];

describe.each(CASES)("venue onboarding wizard in $tag", (c) => {
  beforeAll(async () => {
    stubMatchMedia(true);
    localeRuntime.i18n.addResourceBundle(c.tag, "translation", c.catalog, true, true);
    await localeRuntime.i18n.changeLanguage(c.tag);
  });

  afterAll(async () => {
    await localeRuntime.i18n.changeLanguage("en-US");
  });

  it("translates the welcome step", () => {
    render(
      <WelcomeStep data={{ name: "", slug: "", venueGroupId: "" }} errors={{}} onChange={noop} />
    );
    expect(screen.getByText(c.welcomeHeading)).toBeInTheDocument();
    expect(screen.getByLabelText(c.venueNameLabel)).toBeInTheDocument();
  });

  it("names the selected currency with Intl.DisplayNames in the active locale", () => {
    render(
      <LocationTimeStep
        data={{ ianaTimezone: "", currencyCode: "MXN" }}
        errors={{}}
        onChange={noop}
      />
    );
    expect(screen.getByText(c.currencyLabel)).toBeInTheDocument();
    expect(screen.getByText(c.currencyOption)).toBeInTheDocument();
  });

  it("translates validation messages", () => {
    expect(validateLocationTime({ ianaTimezone: "x", currencyCode: "" }).currencyCode).toBe(
      c.currencyRequired
    );
    expect(validateBasicInfo({ name: "Ok", slug: "", venueGroupId: "" }, "idle").slug).toBe(
      c.slugRequired
    );
    expect(validateOperatingHours({})?.global).toBe(c.hoursAtLeastOne);
  });

  it("translates the hours, settings and floor plan steps", () => {
    render(
      <>
        <OperatingHoursStep data={{}} onChange={noop} />
        <SettingsStep data={RECOMMENDED_SETTINGS} errors={{}} onChange={noop} onAdvance={noop} />
        <FloorPlanStep
          draft={RESTAURANT_DRAFT}
          error={null}
          onSelectTemplate={noop}
          onSelectSize={noop}
          onAddTable={noop}
          onMoveTable={noop}
          onRemoveTable={noop}
        />
      </>
    );
    expect(screen.getAllByText(c.closedLabel)).toHaveLength(7);
    expect(screen.getByRole("button", { name: c.recommendedButton })).toBeInTheDocument();
    expect(screen.getByText(c.floorPlanHeading)).toBeInTheDocument();
    // The room picker's own copy: a card named in the active locale, and the
    // size group beside it (#7256).
    expect(
      screen.getByRole("radio", { name: new RegExp(`^${c.roomCard} — `) })
    ).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: c.roomSizeLabel })).toBeInTheDocument();
  });

  it("translates the launch review and stage panel", () => {
    render(
      <>
        <LaunchStep
          basicInfo={{ name: "Casa", slug: "casa", venueGroupId: "" }}
          locationTime={{ ianaTimezone: "America/Mexico_City", currencyCode: "MXN" }}
          operatingHours={{}}
          settings={RECOMMENDED_SETTINGS}
          onLaunch={async () => undefined}
          onCelebrationDone={noop}
          floorPlan={EMPTY_FLOOR_PLAN_DRAFT}
          launch={INITIAL_LAUNCH_PROGRESS}
        />
        <LaunchStagePanel
          progress={INITIAL_LAUNCH_PROGRESS}
          draft={RESTAURANT_DRAFT}
          venueName="Casa"
        />
      </>
    );
    expect(screen.getByRole("button", { name: c.launchButton })).toBeInTheDocument();
    expect(screen.getByLabelText(c.launchPanelLabel)).toBeInTheDocument();
  });

  it("translates the progress rail and indicator", () => {
    render(
      <>
        <VerticalStepRail currentStep={1} />
        <StepIndicator currentStep={1} totalSteps={6} />
      </>
    );
    expect(screen.getByText(c.railHours)).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: c.wizardProgress })).toBeInTheDocument();
  });
});

describe("currency option labels", () => {
  it("open the select with locale-named options", async () => {
    stubMatchMedia(true);
    Element.prototype.scrollIntoView = vi.fn(); // jsdom has none; the open listbox scrolls to its active option
    localeRuntime.i18n.addResourceBundle("es-MX", "translation", esMX, true, true);
    await localeRuntime.i18n.changeLanguage("es-MX");
    const user = userEvent.setup();
    render(
      <LocationTimeStep data={{ ianaTimezone: "", currencyCode: "" }} errors={{}} onChange={noop} />
    );
    await user.click(screen.getByRole("combobox", { name: /Moneda/ }));
    // The listbox is in the DOM a tick before it is visible (framer-motion does
    // not settle synchronously under jsdom), so poll visibility rather than
    // asserting it on the first match — asserting once made this test win or
    // lose on worker load.
    const option = await screen.findByRole("option", { name: "USD - dólar estadounidense" });
    await waitFor(() => expect(option).toBeVisible());
    await localeRuntime.i18n.changeLanguage("en-US");
  });
});
