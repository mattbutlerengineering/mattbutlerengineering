import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { VenueOnboardingPage } from "./VenueOnboardingPage";
import { generateSlug } from "../components/venue-onboarding/generate-slug";

// Mock dependencies
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
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

const mockCreate = vi.fn();
vi.mock("@mbe/api-client", () => ({
  ApiClient: vi.fn().mockImplementation(() => ({})),
  VenuesClient: vi.fn().mockImplementation(() => ({
    create: mockCreate,
  })),
}));

// Mock Rialto components to simplify testing
vi.mock("@mbe/rialto", () => ({
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
  }: {
    children: React.ReactNode;
    title?: string;
    padding?: string;
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
  }: {
    label?: string;
    value?: string;
    onChange?: (value: string) => void;
    error?: string;
    hint?: string;
    placeholder?: string;
  }) => (
    <div>
      {label && <label>{label}</label>}
      <input value={value} onChange={(e) => onChange?.(e.target.value)} aria-label={label} />
      {hint && <span>{hint}</span>}
      {error && <span role="alert">{error}</span>}
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
      {label && <label>{label}</label>}
      <select value={value} onChange={(e) => onChange?.(e.target.value)}>
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  ),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <VenueOnboardingPage />
    </MemoryRouter>
  );
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
    mockCreate.mockReset();
  });

  it("should render step 1 (Basic Info) by default", () => {
    renderPage();
    expect(screen.getByText("Basic Information")).toBeTruthy();
    expect(screen.getByText("Venue Name")).toBeTruthy();
    expect(screen.getByText("Slug")).toBeTruthy();
  });

  it("should show validation errors when Next is clicked on empty step 1", () => {
    renderPage();
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Name must be at least 2 characters")).toBeTruthy();
    expect(screen.getByText("Slug is required")).toBeTruthy();
  });

  it("should navigate to step 2 after valid step 1", () => {
    renderPage();

    const nameInput = screen.getByLabelText("Venue Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "My Venue" } });

    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Location & Time")).toBeTruthy();
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
    expect(screen.getByText("Basic Information")).toBeTruthy();
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

    // Try to proceed without selecting timezone
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Timezone is required")).toBeTruthy();
  });

  it("should navigate through all 5 steps", () => {
    renderPage();

    // Step 1 — fill name
    const nameInput = screen.getByLabelText("Venue Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "My Venue" } });
    fireEvent.click(screen.getByText("Next"));

    // Step 2 — select timezone
    const timezoneSelect = screen.getByLabelText("Timezone") as HTMLSelectElement;
    fireEvent.change(timezoneSelect, { target: { value: "America/New_York" } });
    fireEvent.click(screen.getByText("Next"));

    // Step 3 — operating hours (optional, just proceed)
    expect(screen.getByText("Operating Hours")).toBeTruthy();
    fireEvent.click(screen.getByText("Next"));

    // Step 4 — settings (optional, just proceed)
    expect(screen.getByText("Venue Settings")).toBeTruthy();
    fireEvent.click(screen.getByText("Next"));

    // Step 5 — review
    expect(screen.getByText("Review & Confirm")).toBeTruthy();
    expect(screen.getByText("Create Venue")).toBeTruthy();
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
    fireEvent.click(screen.getByText("Next")); // skip hours

    // Step 4 — enter invalid data
    const durationInput = screen.getByLabelText(
      "Default Reservation Duration (minutes)"
    ) as HTMLInputElement;
    fireEvent.change(durationInput, { target: { value: "-5" } });
    fireEvent.click(screen.getByText("Next"));

    expect(screen.getByText("Duration must be a positive number")).toBeTruthy();
  });

  it("should submit venue on confirmation step", async () => {
    mockCreate.mockResolvedValueOnce({ id: "venue-123", name: "My Venue" });

    renderPage();

    // Navigate through all steps
    const nameInput = screen.getByLabelText("Venue Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "My Venue" } });
    fireEvent.click(screen.getByText("Next"));

    const tz = screen.getByLabelText("Timezone") as HTMLSelectElement;
    fireEvent.change(tz, { target: { value: "America/New_York" } });
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next")); // skip hours
    fireEvent.click(screen.getByText("Next")); // skip settings

    // Submit
    fireEvent.click(screen.getByText("Create Venue"));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledOnce();
    });

    const payload = mockCreate.mock.calls[0][0];
    expect(payload.name).toBe("My Venue");
    expect(payload.slug).toBe("my-venue");
    expect(payload.ianaTimezone).toBe("America/New_York");
    expect(payload.currencyCode).toBe("USD");
  });

  it("should show success state after venue creation", async () => {
    mockCreate.mockResolvedValueOnce({ id: "venue-456", name: "My Venue" });

    renderPage();

    // Navigate through all steps
    const nameInput = screen.getByLabelText("Venue Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "My Venue" } });
    fireEvent.click(screen.getByText("Next"));

    const tz = screen.getByLabelText("Timezone") as HTMLSelectElement;
    fireEvent.change(tz, { target: { value: "America/New_York" } });
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));

    fireEvent.click(screen.getByText("Create Venue"));

    await waitFor(() => {
      expect(screen.getByText("Success!")).toBeTruthy();
    });

    expect(screen.getByText(/venue-456/)).toBeTruthy();
  });

  it("should show error when API call fails", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Slug already taken"));

    renderPage();

    // Navigate through all steps
    const nameInput = screen.getByLabelText("Venue Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "My Venue" } });
    fireEvent.click(screen.getByText("Next"));

    const tz = screen.getByLabelText("Timezone") as HTMLSelectElement;
    fireEvent.change(tz, { target: { value: "America/New_York" } });
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));

    fireEvent.click(screen.getByText("Create Venue"));

    await waitFor(() => {
      expect(screen.getByText("Slug already taken")).toBeTruthy();
    });
  });

  it("should include operating hours and settings in payload when provided", async () => {
    mockCreate.mockResolvedValueOnce({ id: "venue-789", name: "Full Venue" });

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

    // Step 5 — submit
    fireEvent.click(screen.getByText("Create Venue"));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledOnce();
    });

    const payload = mockCreate.mock.calls[0][0];
    expect(payload.ianaTimezone).toBe("Europe/London");
    expect(payload.currencyCode).toBe("GBP");
    expect(payload.operatingHours).toBeDefined();
    expect(payload.operatingHours.monday).toEqual({ open: "09:00", close: "22:00" });
    expect(payload.settings).toBeDefined();
    expect(payload.settings.defaultReservationDuration).toBe(60);
    expect(payload.settings.maxPartySize).toBe(8);
  });
});
