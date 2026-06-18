import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { GuestDetailsForm } from "./GuestDetailsForm.js";
import type { TimeSlot, ReservationHold } from "@mbe/types";

const mockSlot: TimeSlot = {
  time: "2025-01-01T18:00:00.000Z",
  tableIds: ["t1"],
};

const mockHold: ReservationHold = {
  id: "hold-1",
  expiresAt: new Date(Date.now() + 60000).toISOString(),
};

vi.mock("@mattbutlerengineering/rialto", () => ({
  Input: ({
    label,
    required,
    value,
    onChange,
    onBlur,
    placeholder,
    type,
  }: {
    label?: string;
    required?: boolean;
    value?: string;
    onChange?: (e: any) => void;
    onBlur?: (e: any) => void;
    placeholder?: string;
    type?: string;
  }) => (
    <div data-testid="input-wrapper">
      <label>
        {label}
        {required && "*"}
      </label>
      <input
        data-testid={label?.toLowerCase().replace(/\s/g, "-")}
        type={type || "text"}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
      />
    </div>
  ),
  TextArea: ({
    label,
    value,
    onChange,
    rows,
    placeholder,
  }: {
    label?: string;
    value?: string;
    onChange?: (e: any) => void;
    rows?: number;
    placeholder?: string;
  }) => (
    <div data-testid="textarea-wrapper">
      <label>{label}</label>
      <textarea
        data-testid={label?.toLowerCase().replace(/\s/g, "-")}
        value={value}
        onChange={onChange}
        rows={rows}
        placeholder={placeholder}
      />
    </div>
  ),
  Button: ({
    children,
    variant,
    size,
    disabled,
    onClick,
    type,
  }: {
    children?: React.ReactNode;
    variant?: string;
    size?: string;
    disabled?: boolean;
    onClick?: () => void;
    type?: string;
  }) => (
    <button
      data-testid={variant === "ghost" ? "back-button" : "submit-button"}
      data-variant={variant}
      data-size={size}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  ),
  Alert: ({ children, variant }: { children?: React.ReactNode; variant?: string }) => (
    <div data-testid="alert" data-variant={variant}>
      {children}
    </div>
  ),
  Text: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="text" className={className}>
      {children}
    </div>
  ),
  Banner: ({ children, variant }: { children?: React.ReactNode; variant?: string }) => (
    <div data-testid="recognition-banner" data-variant={variant}>
      {children}
    </div>
  ),
  Badge: ({ children, variant }: { children?: React.ReactNode; variant?: string }) => (
    <span data-testid="preferences-badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

/** Fire email blur + advance 300ms debounce + flush async microtasks */
async function triggerRecognition(emailInput: HTMLElement, email: string) {
  fireEvent.change(emailInput, { target: { value: email } });
  fireEvent.blur(emailInput);
  await act(async () => {
    vi.advanceTimersByTime(300);
    // Flush pending microtasks (promise resolutions) after timer fires
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("GuestDetailsForm", () => {
  const defaultProps = {
    slot: mockSlot,
    hold: null,
    date: "2025-01-01",
    partySize: 4,
    isLoading: false,
    error: null,
    onSubmit: vi.fn(),
    onBack: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should render the form with all fields", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    expect(screen.getByTestId("name")).toBeDefined();
    expect(screen.getByTestId("email")).toBeDefined();
    expect(screen.getByTestId("phone")).toBeDefined();
    expect(screen.getByTestId("special-requests")).toBeDefined();
  });

  it("should display reservation summary", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    expect(screen.getByText(/reservation details/i)).toBeDefined();
    expect(screen.getByText("4 guests")).toBeDefined();
  });

  it("should display error when provided", () => {
    render(<GuestDetailsForm {...defaultProps} error="Test error message" />);
    expect(screen.getByText("Test error message")).toBeDefined();
  });

  it("should call onBack when back button is clicked", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    fireEvent.click(screen.getByTestId("back-button"));
    expect(defaultProps.onBack).toHaveBeenCalledTimes(1);
  });

  it("should update name field on change", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    const nameInput = screen.getByTestId("name");
    fireEvent.change(nameInput, { target: { value: "John Doe" } });
    expect((nameInput as HTMLInputElement).value).toBe("John Doe");
  });

  it("should update email field on change", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    const emailInput = screen.getByTestId("email");
    fireEvent.change(emailInput, { target: { value: "john@example.com" } });
    expect((emailInput as HTMLInputElement).value).toBe("john@example.com");
  });

  it("should update phone field on change", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    const phoneInput = screen.getByTestId("phone");
    fireEvent.change(phoneInput, { target: { value: "555-123-4567" } });
    expect((phoneInput as HTMLInputElement).value).toBe("555-123-4567");
  });

  it("should update notes field on change", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    const notesInput = screen.getByTestId("special-requests");
    fireEvent.change(notesInput, { target: { value: "Birthday celebration" } });
    expect((notesInput as HTMLTextAreaElement).value).toBe("Birthday celebration");
  });

  it("should not submit when name is empty", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    const submitButton = screen.getByTestId("submit-button");
    expect(submitButton).toBeDisabled();
  });

  it("should enable submit when name and email are provided", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    fireEvent.change(screen.getByTestId("name"), { target: { value: "John" } });
    fireEvent.change(screen.getByTestId("email"), {
      target: { value: "john@example.com" },
    });
    const submitButton = screen.getByTestId("submit-button");
    expect(submitButton).not.toBeDisabled();
  });

  it("should enable submit when name and phone are provided", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    fireEvent.change(screen.getByTestId("name"), { target: { value: "John" } });
    fireEvent.change(screen.getByTestId("phone"), {
      target: { value: "555-123-4567" },
    });
    const submitButton = screen.getByTestId("submit-button");
    expect(submitButton).not.toBeDisabled();
  });

  it("should call onSubmit with form data when submitted", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    fireEvent.change(screen.getByTestId("name"), {
      target: { value: "John Doe" },
    });
    fireEvent.change(screen.getByTestId("email"), {
      target: { value: "john@example.com" },
    });
    fireEvent.click(screen.getByTestId("submit-button"));
    expect(defaultProps.onSubmit).toHaveBeenCalledWith({
      name: "John Doe",
      email: "john@example.com",
      phone: "",
      notes: "",
    });
  });

  it("should disable submit button when loading", () => {
    render(<GuestDetailsForm {...defaultProps} isLoading={true} />);
    const submitButton = screen.getByTestId("submit-button");
    expect(submitButton).toBeDisabled();
  });

  it("should show hold timer when hold is provided", () => {
    render(<GuestDetailsForm {...defaultProps} hold={mockHold} />);
    expect(screen.getByText(/hold expires in/i)).toBeDefined();
  });

  // --- Returning guest recognition tests ---

  describe("returning guest recognition", () => {
    const propsWithSlug = {
      ...defaultProps,
      venueSlug: "the-grill",
      apiBaseUrl: "https://api.example.com",
    };

    it("calls recognize endpoint after email blur with 300ms debounce", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recognized: false }),
      });
      global.fetch = mockFetch;

      render(<GuestDetailsForm {...propsWithSlug} />);
      const emailInput = screen.getByTestId("email");

      fireEvent.change(emailInput, { target: { value: "jane@example.com" } });
      fireEvent.blur(emailInput);

      // Before debounce fires — fetch not yet called
      expect(mockFetch).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(300);
        await Promise.resolve();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/public/v1/venues/the-grill/guests/recognize?email=jane%40example.com"
      );
    });

    it("shows welcome banner when guest is recognized (phone field stays empty)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          recognized: true,
          firstName: "Jane",
          visitCount: 5,
          hasPreferences: false,
        }),
      });
      global.fetch = mockFetch;

      render(<GuestDetailsForm {...propsWithSlug} />);

      await triggerRecognition(screen.getByTestId("email"), "jane@example.com");

      expect(screen.getByTestId("recognition-banner")).toBeDefined();
      expect(screen.getByTestId("recognition-banner").textContent).toContain("Welcome back, Jane");
      expect(screen.getByTestId("recognition-banner").textContent).toContain("5th visit");

      // Phone is NOT pre-filled from recognition response
      expect((screen.getByTestId("phone") as HTMLInputElement).value).toBe("");
    });

    it("shows preferences badge when hasPreferences is true", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          recognized: true,
          firstName: "Jane",
          visitCount: 3,
          hasPreferences: true,
        }),
      });
      global.fetch = mockFetch;

      render(<GuestDetailsForm {...propsWithSlug} />);

      await triggerRecognition(screen.getByTestId("email"), "jane@example.com");

      expect(screen.getByTestId("preferences-badge")).toBeDefined();
      expect(screen.getByTestId("preferences-badge").textContent).toContain("Preferences on file");
    });

    it("does not show badge when hasPreferences is false", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          recognized: true,
          firstName: "Jane",
          visitCount: 2,
          hasPreferences: false,
        }),
      });
      global.fetch = mockFetch;

      render(<GuestDetailsForm {...propsWithSlug} />);

      await triggerRecognition(screen.getByTestId("email"), "jane@example.com");

      expect(screen.getByTestId("recognition-banner")).toBeDefined();
      expect(screen.queryByTestId("preferences-badge")).toBeNull();
    });

    it("shows no recognition UI when guest is not recognized", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ recognized: false }),
      });
      global.fetch = mockFetch;

      render(<GuestDetailsForm {...propsWithSlug} />);

      await triggerRecognition(screen.getByTestId("email"), "new@example.com");

      expect(mockFetch).toHaveBeenCalled();
      expect(screen.queryByTestId("recognition-banner")).toBeNull();
    });

    it("silently swallows errors — no recognition UI shown", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch;

      render(<GuestDetailsForm {...propsWithSlug} />);

      await triggerRecognition(screen.getByTestId("email"), "jane@example.com");

      expect(mockFetch).toHaveBeenCalled();
      expect(screen.queryByTestId("recognition-banner")).toBeNull();
    });

    it("silently swallows non-ok HTTP responses", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      });
      global.fetch = mockFetch;

      render(<GuestDetailsForm {...propsWithSlug} />);

      await triggerRecognition(screen.getByTestId("email"), "jane@example.com");

      expect(mockFetch).toHaveBeenCalled();
      expect(screen.queryByTestId("recognition-banner")).toBeNull();
    });

    it("does not call recognize when venueSlug is not provided", async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      render(<GuestDetailsForm {...defaultProps} />);

      await triggerRecognition(screen.getByTestId("email"), "jane@example.com");

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("auto-filled name remains editable; phone is never pre-filled", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          recognized: true,
          firstName: "Jane",
          visitCount: 1,
          hasPreferences: false,
        }),
      });
      global.fetch = mockFetch;

      render(<GuestDetailsForm {...propsWithSlug} />);

      await triggerRecognition(screen.getByTestId("email"), "jane@example.com");

      // Name is auto-filled from recognition
      expect((screen.getByTestId("name") as HTMLInputElement).value).toBe("Jane");

      // Phone is NOT pre-filled — guest must enter it
      expect((screen.getByTestId("phone") as HTMLInputElement).value).toBe("");

      // User can type in phone themselves
      fireEvent.change(screen.getByTestId("phone"), {
        target: { value: "555-111-2222" },
      });
      expect((screen.getByTestId("phone") as HTMLInputElement).value).toBe("555-111-2222");
    });
  });
});
