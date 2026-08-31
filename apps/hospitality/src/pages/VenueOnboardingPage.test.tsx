import { useState, useCallback } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Venue, FloorPlan, Table } from "@mbe/types";
import { VenueOnboardingPage } from "./VenueOnboardingPage";
import { OnboardingWizardProvider } from "../components/venue-onboarding/OnboardingWizardContext";
import { generateSlug } from "../components/venue-onboarding/generate-slug";

// Mock dependencies
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@mbe/auth/react", () => ({
  useAuth: () => ({
    accessToken: "mock-token",
    user: { name: "Test User" },
    signOut: vi.fn(),
  }),
}));

const mockVenuesCreate = vi.fn();
const mockGetBySlug = vi.fn();
const mockFloorPlansCreate = vi.fn();
const mockFloorPlansSetActive = vi.fn();
const mockTablesCreate = vi.fn();
// Stable reference across renders — mirrors the real useApiClient()'s useMemo,
// which only recomputes when the access token changes.
const mockApiClient = {
  venues: { create: mockVenuesCreate, getBySlug: mockGetBySlug },
  floorPlans: { create: mockFloorPlansCreate, setActive: mockFloorPlansSetActive },
  tables: { create: mockTablesCreate },
};
vi.mock("../hooks/useApiClient.js", () => ({
  useApiClient: () => mockApiClient,
}));

// The "server" venue list a real refetchVenues() call would return. A `let`
// (not `const`) so each test can seed it before Launch; `mock`-prefixed so
// vitest's hoisting allows the vi.mock factory below to close over it.
let mockVenuesFixture: Array<{ id: string }> = [];
const mockRefetchVenues = vi.fn(async () => {});
const mockSetVenueId = vi.fn();

// A real (not hand-rolled) reactive stand-in for VenueContext: setVenueId and
// refetchVenues drive real useState, so the page's handoff effects observe
// genuine re-renders exactly like the real context would produce, without
// reimplementing VenueContext's own selection-fallback logic here.
vi.mock("../contexts/VenueContext.js", () => ({
  useVenue: () => {
    const [venues, setVenues] = useState<Array<{ id: string }>>(() => mockVenuesFixture);
    const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

    const setVenueId = useCallback((id: string) => {
      mockSetVenueId(id);
      setVenues((current) => {
        if (current.some((venue) => venue.id === id)) {
          setSelectedVenueId(id);
        }
        return current;
      });
    }, []);

    const refetchVenues = useCallback(async () => {
      await mockRefetchVenues();
      setVenues(mockVenuesFixture);
    }, []);

    return { venues, selectedVenueId, setVenueId, refetchVenues };
  },
}));

const mockToast = vi.fn();

// FloorPlanStep and LaunchStep are each fully covered by their own test
// files (FloorPlanStep.test.tsx, LaunchStep.test.tsx) — here they're mocked
// down to the minimum surface this page wires: template selection, table
// mutation, launch/retry, and celebration-done. runLaunchSequence itself is
// NOT mocked, so tests below exercise the real call order against the
// mocked api client.
vi.mock("../components/venue-onboarding/FloorPlanStep", () => ({
  FloorPlanStep: ({
    error,
    onSelectTemplate,
    onAddTable,
  }: {
    error: string | null;
    onSelectTemplate: (templateId: string) => void;
    onAddTable: (request: unknown) => void;
  }) => (
    <div data-testid="floor-plan-step">
      <span>Floor Plan</span>
      {error && <span role="alert">{error}</span>}
      <button onClick={() => onSelectTemplate("blank")}>Choose Blank</button>
      <button onClick={() => onSelectTemplate("restaurant")}>Choose Restaurant</button>
      <button
        onClick={() =>
          onAddTable({
            name: "Table A",
            capacity: 2,
            minCovers: 1,
            venueId: "__draft__",
            floorPlanId: "__draft__",
            shapeMetadata: { shape: "square", x: 100, y: 100, width: 60, height: 60 },
          })
        }
      >
        Add Table A
      </button>
      <button
        onClick={() =>
          onAddTable({
            name: "Table B",
            capacity: 2,
            minCovers: 1,
            venueId: "__draft__",
            floorPlanId: "__draft__",
            shapeMetadata: { shape: "square", x: 160, y: 100, width: 60, height: 60 },
          })
        }
      >
        Add Table B
      </button>
    </div>
  ),
}));

vi.mock("../components/venue-onboarding/LaunchStep", () => ({
  LaunchStep: ({
    basicInfo,
    floorPlan,
    launch,
    onLaunch,
    onCelebrationDone,
    onRetry,
  }: {
    basicInfo: { name: string };
    floorPlan?: { planName: string };
    launch?: { failedStage: string | null; errorMessage: string | null };
    onLaunch: () => Promise<void>;
    onCelebrationDone: () => void;
    onRetry?: () => Promise<void>;
  }) => (
    <div data-testid="launch-step">
      <span>{basicInfo.name}</span>
      {floorPlan && <span data-testid="launch-plan-name">{floorPlan.planName}</span>}
      <button
        onClick={() => {
          onLaunch().catch(() => {
            /* the page already surfaces the failure via launch.errorMessage */
          });
        }}
      >
        Launch Venue
      </button>
      {launch?.failedStage && <span role="alert">{launch.errorMessage}</span>}
      {launch?.failedStage && onRetry && (
        <button
          onClick={() => {
            onRetry().catch(() => {
              /* same swallow as onLaunch above */
            });
          }}
        >
          Retry
        </button>
      )}
      <button onClick={onCelebrationDone}>Finish celebration</button>
    </div>
  ),
}));

// Mock Rialto components to simplify testing
vi.mock("@mattbutlerengineering/rialto", () => ({
  useToast: () => ({ toast: mockToast, dismiss: vi.fn() }),
  Button: ({
    children,
    onClick,
    disabled,
    loading,
    variant: _variant,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
    variant?: string;
  }) => (
    <button onClick={onClick} disabled={disabled || loading} {...rest}>
      {children}
    </button>
  ),
  Card: ({
    children,
    title,
    padding: _padding,
    variant: _variant,
  }: {
    children: React.ReactNode;
    title?: string;
    padding?: string;
    variant?: string;
  }) => (
    <div>
      {title && <h2>{title}</h2>}
      {children}
    </div>
  ),
  Text: ({
    children,
    variant: _variant,
    color: _color,
    size: _size,
    as: Component = "span",
    ...rest
  }: {
    children: React.ReactNode;
    variant?: string;
    color?: string;
    size?: string;
    as?: React.ElementType;
  }) => <Component {...rest}>{children}</Component>,
  Stack: ({
    children,
  }: {
    children: React.ReactNode;
    gap?: string;
    direction?: string;
    align?: string;
    justify?: string;
  }) => <div>{children}</div>,
  Input: ({
    label,
    value,
    onChange,
    error,
    hint,
    placeholder: _placeholder,
    showOptional: _showOptional,
    required: _required,
    type: _type,
    onBlur,
  }: {
    label?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    error?: boolean;
    hint?: string;
    placeholder?: string;
    showOptional?: boolean;
    required?: boolean;
    type?: string;
    onBlur?: () => void;
  }) => (
    <div>
      {label && <label>{label}</label>}
      <input value={value} onChange={onChange} onBlur={onBlur} aria-label={label} />
      {error && hint ? <span role="alert">{hint}</span> : hint ? <span>{hint}</span> : null}
    </div>
  ),
  Select: ({
    label,
    options,
    value,
    onChange,
    placeholder: _placeholder,
  }: {
    label?: string;
    options?: { value: string; label: string }[];
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
  }) => (
    <div>
      {label && <label htmlFor={`select-${label}`}>{label}</label>}
      <select
        id={`select-${label}`}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        aria-label={label}
      >
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  ),
  Autocomplete: ({
    label,
    options,
    value,
    onChange,
    onSelect,
    placeholder: _placeholder,
    emptyText: _emptyText,
    required: _required,
  }: {
    label?: string;
    options?: { value: string; label: string }[];
    value?: string;
    onChange?: (value: string) => void;
    onSelect?: (option: { value: string; label: string }) => void;
    placeholder?: string;
    emptyText?: string;
    required?: boolean;
  }) => (
    <div>
      {label && <label htmlFor={`autocomplete-${label}`}>{label}</label>}
      <select
        id={`autocomplete-${label}`}
        value={options?.find((o) => o.label === value)?.value ?? ""}
        onChange={(e) => {
          const option = options?.find((o) => o.value === e.target.value);
          if (option) {
            onChange?.(option.label);
            onSelect?.(option);
          } else {
            onChange?.("");
          }
        }}
        aria-label={label}
      >
        <option value="">Select...</option>
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  ),
  Checkbox: ({
    label,
    checked,
    onCheckedChange,
    className: _className,
  }: {
    label: string;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    className?: string;
  }) => (
    <label>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onCheckedChange?.(!checked)}
        aria-label={`${label} open`}
      />
      {label}
    </label>
  ),
  ConfirmDialog: ({
    open,
    onConfirm,
    onCancel,
    title,
    description: _description,
    confirmLabel,
    cancelLabel,
  }: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: string;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <span>{title}</span>
        <button onClick={onCancel}>{cancelLabel ?? "Cancel"}</button>
        <button onClick={onConfirm}>{confirmLabel ?? "Confirm"}</button>
      </div>
    ) : null,
}));

function renderPage() {
  // The wizard state is owned by OnboardingWizardProvider (lifted to the layout
  // in the real app so the left rail and the form share one source of truth).
  return render(
    <MemoryRouter>
      <OnboardingWizardProvider>
        <VenueOnboardingPage />
      </OnboardingWizardProvider>
    </MemoryRouter>
  );
}

/** Fills steps 1-4 with minimal valid data, landing on step 5 (floor plan). */
function advanceToFloorPlanStep(name = "My Venue") {
  const nameInput = screen.getByLabelText("Venue Name") as HTMLInputElement;
  fireEvent.change(nameInput, { target: { value: name } });
  fireEvent.click(screen.getByText("Next"));

  const timezoneSelect = screen.getByLabelText("Timezone") as HTMLSelectElement;
  fireEvent.change(timezoneSelect, { target: { value: "America/New_York" } });
  fireEvent.click(screen.getByText("Next"));

  fireEvent.click(screen.getByLabelText("monday open"));
  fireEvent.click(screen.getByText("Next"));

  fireEvent.click(screen.getByText("Next")); // skip settings
}

/**
 * Fills steps 1-4, picks a floor plan template, and lands on step 6 (Launch
 * review). `onFloorPlanStep` runs after the template is chosen but before
 * advancing past step 5 — the only point FloorPlanStep's mock (and its
 * "Add Table" buttons) is mounted.
 */
function advanceToLaunchStep(
  templateButtonLabel = "Choose Blank",
  name = "My Venue",
  onFloorPlanStep?: () => void
) {
  advanceToFloorPlanStep(name);
  fireEvent.click(screen.getByText(templateButtonLabel));
  onFloorPlanStep?.();
  fireEvent.click(screen.getByText("Next"));
}

function makeVenue(id: string): Venue {
  return {
    id,
    venueGroupId: null,
    name: "My Venue",
    slug: "my-venue",
    ianaTimezone: "America/New_York",
    currencyCode: "USD",
    operatingHours: null,
    settings: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeFloorPlan(id: string, venueId: string, isActive = false): FloorPlan {
  return {
    id,
    venueId,
    name: "Main Floor",
    isActive,
    layoutJson: { width: 800, height: 600, gridSize: 20, showGrid: true },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeTable(name: string): Table {
  return {
    id: `table-${name}`,
    name,
    tableNumber: null,
    capacity: 2,
    minCovers: 1,
    maxCovers: null,
    location: null,
    isActive: true,
    priority: 0,
    status: "AVAILABLE",
    venueId: "venue-1",
    floorPlanId: "plan-1",
    shapeMetadata: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Flush pending microtasks (promise resolutions in the launch -> handoff chain). */
async function flushMicrotasks(times = 8) {
  await act(async () => {
    for (let i = 0; i < times; i += 1) {
      await Promise.resolve();
    }
  });
}

describe("generateSlug", () => {
  it("should convert name to lowercase with hyphens", () => {
    expect(generateSlug("The Grand Ballroom")).toBe("the-grand-ballroom");
  });

  it("should remove special characters", () => {
    expect(generateSlug("Joe's Bar & Grill!")).toBe("joes-bar-grill");
  });

  it("should collapse multiple hyphens", () => {
    expect(generateSlug("a---b")).toBe("a-b");
  });

  it("should trim leading/trailing hyphens", () => {
    expect(generateSlug(" Hello World ")).toBe("hello-world");
  });

  it("should handle empty string", () => {
    expect(generateSlug("")).toBe("");
  });
});

describe("VenueOnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVenuesFixture = [];
  });

  it("should render step 1 (Welcome + Basic Info) by default", () => {
    renderPage();
    expect(screen.getByText(/give your venue a home/i)).toBeTruthy();
    expect(screen.getByText("Venue Name")).toBeTruthy();
    expect(screen.getByText("Slug")).toBeTruthy();
  });

  it("should show validation errors when Next is clicked on empty step 1", () => {
    renderPage();
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Name must be at least 2 characters")).toBeTruthy();
    expect(screen.getByText("Slug is required")).toBeTruthy();
  });

  // Regression: #3082 refactor dropped the onValidate prop on the step
  // components, so on-blur field validation was dead (errors only surfaced on
  // Next). Blurring an invalid field must show its error without clicking Next.
  it("should validate a field on blur without clicking Next", () => {
    renderPage();
    const nameInput = screen.getByLabelText("Venue Name") as HTMLInputElement;
    fireEvent.blur(nameInput);
    expect(screen.getByText("Name must be at least 2 characters")).toBeTruthy();
  });

  it("should navigate to step 2 after valid step 1", () => {
    renderPage();

    const nameInput = screen.getByLabelText("Venue Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "My Venue" } });

    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Location & Time")).toBeTruthy();
    expect(screen.getByLabelText("Timezone")).toBeTruthy();
  });

  it("should navigate back from step 2 to step 1", () => {
    renderPage();

    // Go to step 2
    const nameInput = screen.getByLabelText("Venue Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "My Venue" } });
    fireEvent.click(screen.getByText("Next"));

    expect(screen.getByText("Location & Time")).toBeTruthy();

    // Go back
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText(/give your venue a home/i)).toBeTruthy();
  });

  it("should disable Back button on step 1", () => {
    renderPage();
    const backButton = screen.getByText("Back") as HTMLButtonElement;
    expect(backButton.disabled).toBe(true);
  });

  it("should show validation error on step 2 when timezone is not selected", () => {
    renderPage();

    // Fill step 1
    const nameInput = screen.getByLabelText("Venue Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "My Venue" } });
    fireEvent.click(screen.getByText("Next"));

    // Clear the timezone (mock Autocomplete renders as select)
    const timezoneSelect = screen.getByLabelText("Timezone") as HTMLSelectElement;
    fireEvent.change(timezoneSelect, { target: { value: "" } });

    // Try to proceed without selecting timezone
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Timezone is required")).toBeTruthy();
  });

  it("should navigate through all 6 steps, reaching the floor plan step then the Launch review", () => {
    renderPage();

    // Step 1 — fill name
    const nameInput = screen.getByLabelText("Venue Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "My Venue" } });
    fireEvent.click(screen.getByText("Next"));

    // Step 2 — select timezone
    const timezoneSelect = screen.getByLabelText("Timezone") as HTMLSelectElement;
    fireEvent.change(timezoneSelect, { target: { value: "America/New_York" } });
    fireEvent.click(screen.getByText("Next"));

    // Step 3 — operating hours (must toggle at least one day)
    expect(screen.getByText("Operating Hours")).toBeTruthy();
    const mondayToggle = screen.getByLabelText("monday open") as HTMLInputElement;
    fireEvent.click(mondayToggle);
    fireEvent.click(screen.getByText("Next"));

    // Step 4 — settings (optional, just proceed)
    expect(screen.getByText("Venue Settings")).toBeTruthy();
    fireEvent.click(screen.getByText("Next"));

    // Step 5 — floor plan
    expect(screen.getByTestId("floor-plan-step")).toBeTruthy();
    fireEvent.click(screen.getByText("Choose Blank"));
    fireEvent.click(screen.getByText("Next"));

    // Step 6 — Launch review
    expect(screen.getByTestId("launch-step")).toBeTruthy();
    expect(screen.getByText("My Venue")).toBeTruthy();
    expect(screen.getByText("Launch Venue")).toBeTruthy();
  });

  it("should show validation error on step 3 when no days are open", () => {
    renderPage();

    // Navigate to step 3
    const nameInput = screen.getByLabelText("Venue Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "My Venue" } });
    fireEvent.click(screen.getByText("Next"));

    const tz = screen.getByLabelText("Timezone") as HTMLSelectElement;
    fireEvent.change(tz, { target: { value: "America/New_York" } });
    fireEvent.click(screen.getByText("Next"));

    // Try to proceed with no days open
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("At least one day must be open")).toBeTruthy();
  });

  it("should validate settings step when values are provided but invalid", () => {
    renderPage();

    // Navigate to step 4
    const nameInput = screen.getByLabelText("Venue Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "My Venue" } });
    fireEvent.click(screen.getByText("Next"));

    const tz = screen.getByLabelText("Timezone") as HTMLSelectElement;
    fireEvent.change(tz, { target: { value: "America/New_York" } });
    fireEvent.click(screen.getByText("Next"));

    // Step 3 — toggle a day then proceed
    const mondayToggle = screen.getByLabelText("monday open") as HTMLInputElement;
    fireEvent.click(mondayToggle);
    fireEvent.click(screen.getByText("Next"));

    // Step 4 — enter invalid data
    const durationInput = screen.getByLabelText(
      "Default Reservation Duration (minutes)"
    ) as HTMLInputElement;
    fireEvent.change(durationInput, { target: { value: "-5" } });
    fireEvent.click(screen.getByText("Next"));

    expect(screen.getByText("Duration must be a positive number")).toBeTruthy();
  });

  it("refuses to advance from step 5 without a template and surfaces the required-layout sentence", () => {
    renderPage();
    advanceToFloorPlanStep();

    fireEvent.click(screen.getByText("Next"));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose a layout to continue — pick Blank to start with an empty floor."
    );
    // Still on step 5 — the floor plan step, not the Launch review.
    expect(screen.getByTestId("floor-plan-step")).toBeTruthy();
  });

  it("applies the wide container class on step 5 only", () => {
    const { container } = renderPage();
    const wrapper = container.firstChild as HTMLElement;

    expect(wrapper.className).not.toContain("wizardContainerWide"); // step 1

    const nameInput = screen.getByLabelText("Venue Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "My Venue" } });
    fireEvent.click(screen.getByText("Next"));
    const tz = screen.getByLabelText("Timezone") as HTMLSelectElement;
    fireEvent.change(tz, { target: { value: "America/New_York" } });
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByLabelText("monday open"));
    fireEvent.click(screen.getByText("Next"));

    expect(wrapper.className).not.toContain("wizardContainerWide"); // step 4
    fireEvent.click(screen.getByText("Next"));

    expect(wrapper.className).toContain("wizardContainerWide"); // step 5

    fireEvent.click(screen.getByText("Choose Blank"));
    fireEvent.click(screen.getByText("Next"));

    expect(wrapper.className).not.toContain("wizardContainerWide"); // step 6
  });

  it("runs the launch sequence in order — venue, floor plan, tables in order, then activate", async () => {
    const order: string[] = [];
    mockVenuesCreate.mockImplementation(async () => {
      order.push("venue");
      return makeVenue("venue-1");
    });
    mockFloorPlansCreate.mockImplementation(async () => {
      order.push("floorPlan");
      return makeFloorPlan("plan-1", "venue-1");
    });
    mockTablesCreate.mockImplementation(async (data: { name: string }) => {
      order.push(`table:${data.name}`);
      return makeTable(data.name);
    });
    mockFloorPlansSetActive.mockImplementation(async () => {
      order.push("activate");
      return makeFloorPlan("plan-1", "venue-1", true);
    });
    mockVenuesFixture = [{ id: "venue-1" }];

    renderPage();
    advanceToLaunchStep("Choose Blank", "My Venue", () => {
      fireEvent.click(screen.getByText("Add Table A"));
      fireEvent.click(screen.getByText("Add Table B"));
    });

    fireEvent.click(screen.getByText("Launch Venue"));

    await waitFor(() => {
      expect(mockFloorPlansSetActive).toHaveBeenCalledOnce();
    });

    expect(order).toEqual(["venue", "floorPlan", "table:Table A", "table:Table B", "activate"]);
    expect(mockVenuesCreate).toHaveBeenCalledOnce();
    expect(mockFloorPlansCreate).toHaveBeenCalledOnce();
  });

  it("shows an alert with the launch's error message when a stage fails, without refetching or toasting", async () => {
    mockVenuesCreate.mockRejectedValueOnce(new Error("Slug already taken"));

    renderPage();
    advanceToLaunchStep("Choose Blank");
    fireEvent.click(screen.getByText("Launch Venue"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Slug already taken");
    });

    expect(mockRefetchVenues).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("M8: retry after a mid-table failure issues no second venue/floor-plan POST and resumes at the first uncreated table", async () => {
    mockVenuesCreate.mockResolvedValueOnce(makeVenue("venue-1"));
    mockFloorPlansCreate.mockResolvedValueOnce(makeFloorPlan("plan-1", "venue-1"));
    mockTablesCreate
      .mockResolvedValueOnce(makeTable("Table A"))
      .mockRejectedValueOnce(new Error("Stopped at table 2 of 2"))
      .mockResolvedValueOnce(makeTable("Table B"));
    mockFloorPlansSetActive.mockResolvedValueOnce(makeFloorPlan("plan-1", "venue-1", true));
    mockVenuesFixture = [{ id: "venue-1" }];

    renderPage();
    advanceToLaunchStep("Choose Blank", "My Venue", () => {
      fireEvent.click(screen.getByText("Add Table A"));
      fireEvent.click(screen.getByText("Add Table B"));
    });

    fireEvent.click(screen.getByText("Launch Venue"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Stopped at table 2 of 2");
    });

    expect(mockVenuesCreate).toHaveBeenCalledOnce();
    expect(mockFloorPlansCreate).toHaveBeenCalledOnce();
    expect(mockTablesCreate).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(mockFloorPlansSetActive).toHaveBeenCalledOnce();
    });

    expect(mockVenuesCreate).toHaveBeenCalledOnce();
    expect(mockFloorPlansCreate).toHaveBeenCalledOnce();
    expect(mockTablesCreate).toHaveBeenCalledTimes(3);
    expect(mockTablesCreate.mock.calls[2]?.[0]).toMatchObject({ name: "Table B" });
  });

  it("shows 'Venue is live' with the N-tables body when the launched plan has tables", async () => {
    mockVenuesCreate.mockResolvedValueOnce(makeVenue("venue-1"));
    mockFloorPlansCreate.mockResolvedValueOnce(makeFloorPlan("plan-1", "venue-1"));
    mockTablesCreate.mockImplementation(async (data: { name: string }) => makeTable(data.name));
    mockFloorPlansSetActive.mockResolvedValueOnce(makeFloorPlan("plan-1", "venue-1", true));
    mockVenuesFixture = [{ id: "venue-1" }];

    renderPage();
    advanceToLaunchStep("Choose Blank", "My Venue", () => {
      fireEvent.click(screen.getByText("Add Table A"));
      fireEvent.click(screen.getByText("Add Table B"));
    });
    fireEvent.click(screen.getByText("Launch Venue"));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Venue is live",
          description: '"My Venue" is ready with 2 tables on Main Floor.',
          variant: "success",
        })
      );
    });
  });

  it("shows the zero-tables body copy when the launched plan has no tables", async () => {
    mockVenuesCreate.mockResolvedValueOnce(makeVenue("venue-1"));
    mockFloorPlansCreate.mockResolvedValueOnce(makeFloorPlan("plan-1", "venue-1"));
    mockFloorPlansSetActive.mockResolvedValueOnce(makeFloorPlan("plan-1", "venue-1", true));
    mockVenuesFixture = [{ id: "venue-1" }];

    renderPage();
    advanceToLaunchStep("Choose Blank");
    fireEvent.click(screen.getByText("Launch Venue"));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Venue is live",
          description:
            '"My Venue" is ready. Add tables to Main Floor to start taking reservations.',
          variant: "success",
        })
      );
    });
  });

  it("navigates to /floor-plans/{planId} once the celebration finishes and the new venue is selected", async () => {
    mockVenuesCreate.mockResolvedValueOnce(makeVenue("venue-1"));
    mockFloorPlansCreate.mockResolvedValueOnce(makeFloorPlan("plan-1", "venue-1"));
    mockFloorPlansSetActive.mockResolvedValueOnce(makeFloorPlan("plan-1", "venue-1", true));
    mockVenuesFixture = [{ id: "venue-1" }];

    renderPage();
    advanceToLaunchStep("Choose Blank");
    fireEvent.click(screen.getByText("Launch Venue"));

    await waitFor(() => expect(mockRefetchVenues).toHaveBeenCalledOnce());

    // Celebration is shown before navigating — no immediate redirect.
    expect(mockNavigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Finish celebration"));

    await waitFor(() => {
      // The plan id from the sequence, not the venue id.
      expect(mockNavigate).toHaveBeenCalledWith("/floor-plans/plan-1", { replace: true });
    });
  });

  it("Story 6: selects the newly-launched venue (not venues[0]) before navigating, in a multi-venue fixture", async () => {
    mockVenuesCreate.mockResolvedValueOnce(makeVenue("venue-new"));
    mockFloorPlansCreate.mockResolvedValueOnce(makeFloorPlan("plan-new", "venue-new"));
    mockFloorPlansSetActive.mockResolvedValueOnce(makeFloorPlan("plan-new", "venue-new", true));
    mockVenuesFixture = [{ id: "venue-a" }, { id: "venue-b" }, { id: "venue-new" }];

    renderPage();
    advanceToLaunchStep("Choose Blank");
    fireEvent.click(screen.getByText("Launch Venue"));

    await waitFor(() => expect(mockRefetchVenues).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByText("Finish celebration"));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/floor-plans/plan-new", { replace: true });
    });

    expect(mockSetVenueId).toHaveBeenCalledWith("venue-new");
    const setVenueIdOrder = mockSetVenueId.mock.invocationCallOrder[0];
    const navigateOrder = mockNavigate.mock.invocationCallOrder[0];
    expect(setVenueIdOrder).toBeLessThan(navigateOrder);
  });

  it("stays on the celebration and never navigates if refetchVenues never returns the new venue", async () => {
    mockVenuesCreate.mockResolvedValueOnce(makeVenue("venue-1"));
    mockFloorPlansCreate.mockResolvedValueOnce(makeFloorPlan("plan-1", "venue-1"));
    mockFloorPlansSetActive.mockResolvedValueOnce(makeFloorPlan("plan-1", "venue-1", true));
    mockVenuesFixture = []; // refetch never surfaces the new venue

    renderPage();
    advanceToLaunchStep("Choose Blank");
    fireEvent.click(screen.getByText("Launch Venue"));

    await waitFor(() => expect(mockRefetchVenues).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByText("Finish celebration"));
    await flushMicrotasks();

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByTestId("launch-step")).toBeTruthy();
  });

  it("includes operating hours and settings in the venue payload", async () => {
    mockVenuesCreate.mockResolvedValueOnce(makeVenue("venue-789"));
    mockFloorPlansCreate.mockResolvedValueOnce(makeFloorPlan("plan-789", "venue-789"));
    mockFloorPlansSetActive.mockResolvedValueOnce(makeFloorPlan("plan-789", "venue-789", true));
    mockVenuesFixture = [{ id: "venue-789" }];

    renderPage();

    // Step 1
    const nameInput = screen.getByLabelText("Venue Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Full Venue" } });
    fireEvent.click(screen.getByText("Next"));

    // Step 2
    const tz = screen.getByLabelText("Timezone") as HTMLSelectElement;
    fireEvent.change(tz, { target: { value: "Europe/London" } });
    const currency = screen.getByLabelText("Currency") as HTMLSelectElement;
    fireEvent.change(currency, { target: { value: "GBP" } });
    fireEvent.click(screen.getByText("Next"));

    // Step 3 — toggle monday on
    const mondayToggle = screen.getByLabelText("monday open") as HTMLInputElement;
    fireEvent.click(mondayToggle);
    fireEvent.click(screen.getByText("Next"));

    // Step 4 — add settings
    const durationInput = screen.getByLabelText(
      "Default Reservation Duration (minutes)"
    ) as HTMLInputElement;
    fireEvent.change(durationInput, { target: { value: "60" } });
    const partyInput = screen.getByLabelText("Maximum Party Size") as HTMLInputElement;
    fireEvent.change(partyInput, { target: { value: "8" } });
    fireEvent.click(screen.getByText("Next"));

    // Step 5 — floor plan
    fireEvent.click(screen.getByText("Choose Blank"));
    fireEvent.click(screen.getByText("Next"));

    // Step 6 — launch
    fireEvent.click(screen.getByText("Launch Venue"));

    await waitFor(() => {
      expect(mockVenuesCreate).toHaveBeenCalledOnce();
    });

    const payload = mockVenuesCreate.mock.calls[0]?.[0];
    expect(payload.ianaTimezone).toBe("Europe/London");
    expect(payload.currencyCode).toBe("GBP");
    expect(payload.operatingHours).toBeDefined();
    expect(payload.operatingHours.monday).toEqual({
      open: "09:00",
      close: "22:00",
    });
    expect(payload.settings).toBeDefined();
    expect(payload.settings.defaultReservationDuration).toBe(60);
    expect(payload.settings.maxPartySize).toBe(8);
  });
});
