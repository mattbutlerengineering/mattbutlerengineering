/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { GuestDetailsForm } from "./GuestDetailsForm.js";
import enUS from "../../i18n/catalogs/en-US.json";
import type { TimeSlot, ReservationHold } from "@mbe/types";

const mockSlot: TimeSlot = {
  time: "2025-01-01T18:00:00.000Z",
  available: true,
};

const mockHold: ReservationHold = {
  id: "hold-1",
  venueId: "venue-1",
  tableId: "t1",
  date: "2025-01-01",
  startTime: "2025-01-01T18:00:00.000Z",
  endTime: "2025-01-01T19:30:00.000Z",
  partySize: 2,
  sessionId: "session-1",
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  createdAt: "2025-01-01T17:55:00.000Z",
};

const mockApi = {
  publicVenue: {
    recognizeGuest: vi.fn(),
  },
};

vi.mock("@mattbutlerengineering/rialto", async () => {
  type MockInputProps = {
    ref?: React.Ref<HTMLInputElement>;
    label?: string;
    required?: boolean;
    error?: boolean;
    hint?: string;
    value?: string;
    onChange?: (e: any) => void;
    onBlur?: (e: any) => void;
    placeholder?: string;
    type?: string;
    id?: string;
    autoComplete?: string;
    "aria-describedby"?: string;
  };
  // Mirrors rialto's Input wiring: the control id (explicit or derived), its
  // hint at `${id}-hint`, aria-invalid on error, hint text tied to the control
  // through aria-describedby (an explicit prop overrides it, as rialto's rest
  // spread does), extra attributes passed through, ref forwarded to <input>.
  const MockInput = ({
    ref,
    label,
    required,
    error,
    hint,
    value,
    onChange,
    onBlur,
    placeholder,
    type,
    id,
    autoComplete,
    ...rest
  }: MockInputProps) => {
    const testId = label?.toLowerCase().replace(/\s/g, "-");
    const inputId = id ?? testId;
    // rialto spreads the rest props after its own wiring, so a passed
    // `aria-describedby` key wins even when its value is undefined.
    const describedBy =
      "aria-describedby" in rest ? rest["aria-describedby"] : hint ? `${inputId}-hint` : undefined;
    return (
      <div data-testid="input-wrapper">
        <label htmlFor={inputId}>
          {label}
          {required && "*"}
        </label>
        <input
          ref={ref}
          id={inputId}
          data-testid={testId}
          type={type || "text"}
          autoComplete={autoComplete}
          required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
        />
        {hint && <span id={`${inputId}-hint`}>{hint}</span>}
      </div>
    );
  };
  return {
    Input: MockInput,
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
        {/* Mirrors rialto's TextArea, whose visible label is tied to the control. */}
        <label htmlFor={label?.toLowerCase().replace(/\s/g, "-")}>{label}</label>
        <textarea
          id={label?.toLowerCase().replace(/\s/g, "-")}
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
      type?: "button" | "submit" | "reset";
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
  };
});

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
    api: mockApi as any,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
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

  it("displays the reservation summary time in the venue's timezone, not the device's (#4976)", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      // mockSlot.time is 18:00Z on 2025-01-01: 1:00 PM in New York (EST,
      // UTC-5) but 10:00 AM on a Los Angeles device (PST, UTC-8).
      render(<GuestDetailsForm {...defaultProps} venueTimezone="America/New_York" />);
      expect(screen.getByText("1:00 PM")).toBeDefined();
      expect(screen.queryByText("10:00 AM")).toBeNull();
    } finally {
      process.env.TZ = originalTz;
    }
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

  it("labels the notes field with the shared Special Requests label", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    const notesInput = screen.getByLabelText(enUS.bookingWidget.specialRequests.label);
    expect(notesInput.tagName).toBe("TEXTAREA");
    expect(notesInput).toBe(screen.getByTestId("special-requests"));
  });

  it("should update notes field on change", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    const notesInput = screen.getByTestId("special-requests");
    fireEvent.change(notesInput, { target: { value: "Birthday celebration" } });
    expect((notesInput as HTMLTextAreaElement).value).toBe("Birthday celebration");
  });

  it("keeps Complete Reservation enabled on an empty form", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    expect(screen.getByTestId("submit-button")).not.toBeDisabled();
  });

  it("shows no errors before a submit attempt", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    expect(screen.getByTestId("name").getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByTestId("email").getAttribute("aria-invalid")).toBeNull();
  });

  it("marks Name as required", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    expect(screen.getByTestId("name")).toBeRequired();
  });

  it("submitting empty shows a Name error, focuses Name, and does not call onSubmit", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    fireEvent.click(screen.getByTestId("submit-button"));
    const nameInput = screen.getByTestId("name");
    expect(nameInput.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(enUS.bookingWidget.details.nameRequired)).toBeDefined();
    expect(document.activeElement).toBe(nameInput);
    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
  });

  it("name-only submit shows the contact error, focuses Email, and does not call onSubmit", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    fireEvent.change(screen.getByTestId("name"), { target: { value: "John" } });
    fireEvent.click(screen.getByTestId("submit-button"));
    const emailInput = screen.getByTestId("email");
    expect(screen.getByTestId("name").getAttribute("aria-invalid")).toBeNull();
    expect(emailInput.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByTestId("phone").getAttribute("aria-invalid")).toBe("true");
    expect(emailInput.getAttribute("aria-describedby")).toBe(
      screen.getByText(enUS.bookingWidget.details.contactHint).id
    );
    expect(document.activeElement).toBe(emailInput);
    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
  });

  it("states the either-email-or-phone guidance once, linked to the contact field", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    expect(screen.getAllByText(enUS.bookingWidget.details.contactHint)).toHaveLength(1);
    expect(screen.getByTestId("phone").getAttribute("aria-describedby")).toBe(
      screen.getByText(enUS.bookingWidget.details.contactHint).id
    );
    fireEvent.click(screen.getByTestId("submit-button"));
    expect(screen.getAllByText(enUS.bookingWidget.details.contactHint)).toHaveLength(1);
  });

  it("describes Phone's invalid state with the either/or message after an empty contact submit", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    fireEvent.change(screen.getByTestId("name"), { target: { value: "John" } });
    fireEvent.click(screen.getByTestId("submit-button"));
    const phoneInput = screen.getByTestId("phone");
    expect(phoneInput.getAttribute("aria-invalid")).toBe("true");
    const describedBy = phoneInput.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? "")?.textContent).toBe(
      enUS.bookingWidget.details.contactHint
    );
  });

  it("tells autofill which guest field is which (WCAG 1.3.5)", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    expect(screen.getByTestId("name").getAttribute("autocomplete")).toBe("name");
    expect(screen.getByTestId("email").getAttribute("autocomplete")).toBe("email");
    expect(screen.getByTestId("phone").getAttribute("autocomplete")).toBe("tel");
  });

  describe("email format", () => {
    it("flags a malformed email on blur with a described field error", () => {
      render(<GuestDetailsForm {...defaultProps} />);
      const emailInput = screen.getByTestId("email");
      fireEvent.change(emailInput, { target: { value: "not-an-email" } });
      fireEvent.blur(emailInput);
      expect(emailInput.getAttribute("aria-invalid")).toBe("true");
      const error = screen.getByText(enUS.bookingWidget.details.emailInvalid);
      expect(emailInput.getAttribute("aria-describedby")).toBe(error.id);
      // The phone field is not part of this error.
      expect(screen.getByTestId("phone").getAttribute("aria-invalid")).toBeNull();
    });

    it("does not flag a malformed email while the guest is still typing", () => {
      render(<GuestDetailsForm {...defaultProps} />);
      const emailInput = screen.getByTestId("email");
      fireEvent.change(emailInput, { target: { value: "jane@" } });
      expect(emailInput.getAttribute("aria-invalid")).toBeNull();
      expect(screen.queryByText(enUS.bookingWidget.details.emailInvalid)).toBeNull();
    });

    it("clears the email error once the address is fixed", () => {
      render(<GuestDetailsForm {...defaultProps} />);
      const emailInput = screen.getByTestId("email");
      fireEvent.change(emailInput, { target: { value: "not-an-email" } });
      fireEvent.blur(emailInput);
      fireEvent.change(emailInput, { target: { value: "jane@example.com" } });
      expect(emailInput.getAttribute("aria-invalid")).toBeNull();
      expect(screen.queryByText(enUS.bookingWidget.details.emailInvalid)).toBeNull();
    });

    it("blocks submit on a malformed email, even with a phone, and focuses Email", () => {
      render(<GuestDetailsForm {...defaultProps} />);
      fireEvent.change(screen.getByTestId("name"), { target: { value: "John" } });
      fireEvent.change(screen.getByTestId("phone"), { target: { value: "555-123-4567" } });
      const emailInput = screen.getByTestId("email");
      fireEvent.change(emailInput, { target: { value: "not-an-email" } });
      fireEvent.click(screen.getByTestId("submit-button"));
      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
      expect(emailInput.getAttribute("aria-invalid")).toBe("true");
      expect(screen.getByText(enUS.bookingWidget.details.emailInvalid)).toBeDefined();
      expect(document.activeElement).toBe(emailInput);
    });

    it("does not call recognize for a malformed address", async () => {
      render(<GuestDetailsForm {...defaultProps} venueSlug="the-grill" />);
      await triggerRecognition(screen.getByTestId("email"), "not-an-email");
      expect(mockApi.publicVenue.recognizeGuest).not.toHaveBeenCalled();
    });
  });

  describe("hold countdown announcements", () => {
    const holdExpiringIn = (ms: number): ReservationHold => ({
      ...mockHold,
      expiresAt: new Date(Date.now() + ms).toISOString(),
    });

    it("keeps the ticking countdown out of every live region", () => {
      render(<GuestDetailsForm {...defaultProps} hold={holdExpiringIn(10 * 60_000)} />);
      const timer = screen.getByText(/hold expires in/i);
      expect(timer.closest("[aria-live]")).toBeNull();
      expect(timer.closest("[role='status']")).toBeNull();
    });

    it("has an always-mounted polite region that stays silent with time to spare", () => {
      render(<GuestDetailsForm {...defaultProps} hold={holdExpiringIn(10 * 60_000)} />);
      const region = screen.getByRole("status");
      expect(region.getAttribute("aria-live")).toBe("polite");
      expect(region.textContent).toBe("");
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(region.textContent).toBe("");
    });

    it("announces once when two minutes are left, without repeating each second", () => {
      render(<GuestDetailsForm {...defaultProps} hold={holdExpiringIn(2 * 60_000 + 5_000)} />);
      const region = screen.getByRole("status");
      expect(region.textContent).toBe("");
      act(() => {
        vi.advanceTimersByTime(6_000);
      });
      expect(region.textContent).toBe(enUS.bookingWidget.details.holdAnnounceTwoMinutes);
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(region.textContent).toBe(enUS.bookingWidget.details.holdAnnounceTwoMinutes);
    });

    it("announces when the hold expires", () => {
      render(<GuestDetailsForm {...defaultProps} hold={holdExpiringIn(3_000)} />);
      act(() => {
        vi.advanceTimersByTime(4_000);
      });
      expect(screen.getByRole("status").textContent).toBe(
        enUS.bookingWidget.details.holdAnnounceExpired
      );
    });

    it("renders no announcement region without a hold", () => {
      render(<GuestDetailsForm {...defaultProps} />);
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  it("clears the Name error as the guest types a name", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    fireEvent.click(screen.getByTestId("submit-button"));
    fireEvent.change(screen.getByTestId("name"), { target: { value: "J" } });
    expect(screen.getByTestId("name").getAttribute("aria-invalid")).toBeNull();
  });

  it("clears the contact error once an email is entered", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    fireEvent.change(screen.getByTestId("name"), { target: { value: "John" } });
    fireEvent.click(screen.getByTestId("submit-button"));
    fireEvent.change(screen.getByTestId("email"), { target: { value: "j@example.com" } });
    expect(screen.getByTestId("email").getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByTestId("phone").getAttribute("aria-invalid")).toBeNull();
  });

  it("submits with name and phone only", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    fireEvent.change(screen.getByTestId("name"), { target: { value: "John" } });
    fireEvent.change(screen.getByTestId("phone"), {
      target: { value: "555-123-4567" },
    });
    fireEvent.click(screen.getByTestId("submit-button"));
    expect(defaultProps.onSubmit).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSubmit).toHaveBeenCalledWith({
      name: "John",
      email: "",
      phone: "555-123-4567",
      notes: "",
    });
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
    };

    it("calls recognize endpoint after email blur with 300ms debounce", async () => {
      mockApi.publicVenue.recognizeGuest.mockResolvedValue({
        recognized: false,
        firstName: null,
        visitCount: 0,
        hasPreferences: false,
      });

      render(<GuestDetailsForm {...propsWithSlug} />);
      const emailInput = screen.getByTestId("email");

      fireEvent.change(emailInput, { target: { value: "jane@example.com" } });
      fireEvent.blur(emailInput);

      // Before debounce fires — recognize not yet called
      expect(mockApi.publicVenue.recognizeGuest).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(300);
        await Promise.resolve();
      });

      expect(mockApi.publicVenue.recognizeGuest).toHaveBeenCalledWith(
        "the-grill",
        "jane@example.com"
      );
    });

    it("shows welcome banner when guest is recognized (phone field stays empty)", async () => {
      mockApi.publicVenue.recognizeGuest.mockResolvedValue({
        recognized: true,
        firstName: "Jane",
        visitCount: 5,
        hasPreferences: false,
      });

      render(<GuestDetailsForm {...propsWithSlug} />);

      await triggerRecognition(screen.getByTestId("email"), "jane@example.com");

      expect(screen.getByTestId("recognition-banner")).toBeDefined();
      expect(screen.getByTestId("recognition-banner").textContent).toContain("Welcome back, Jane");
      expect(screen.getByTestId("recognition-banner").textContent).toContain("5th visit");

      // Phone is NOT pre-filled from recognition response
      expect((screen.getByTestId("phone") as HTMLInputElement).value).toBe("");
    });

    it("shows preferences badge when hasPreferences is true", async () => {
      mockApi.publicVenue.recognizeGuest.mockResolvedValue({
        recognized: true,
        firstName: "Jane",
        visitCount: 3,
        hasPreferences: true,
      });

      render(<GuestDetailsForm {...propsWithSlug} />);

      await triggerRecognition(screen.getByTestId("email"), "jane@example.com");

      expect(screen.getByTestId("preferences-badge")).toBeDefined();
      expect(screen.getByTestId("preferences-badge").textContent).toContain("Preferences on file");
    });

    it("does not show badge when hasPreferences is false", async () => {
      mockApi.publicVenue.recognizeGuest.mockResolvedValue({
        recognized: true,
        firstName: "Jane",
        visitCount: 2,
        hasPreferences: false,
      });

      render(<GuestDetailsForm {...propsWithSlug} />);

      await triggerRecognition(screen.getByTestId("email"), "jane@example.com");

      expect(screen.getByTestId("recognition-banner")).toBeDefined();
      expect(screen.queryByTestId("preferences-badge")).toBeNull();
    });

    it("shows no recognition UI when guest is not recognized", async () => {
      mockApi.publicVenue.recognizeGuest.mockResolvedValue({
        recognized: false,
        firstName: null,
        visitCount: 0,
        hasPreferences: false,
      });

      render(<GuestDetailsForm {...propsWithSlug} />);

      await triggerRecognition(screen.getByTestId("email"), "new@example.com");

      expect(mockApi.publicVenue.recognizeGuest).toHaveBeenCalled();
      expect(screen.queryByTestId("recognition-banner")).toBeNull();
    });

    it("silently swallows errors — no recognition UI shown", async () => {
      mockApi.publicVenue.recognizeGuest.mockRejectedValue(new Error("Network error"));

      render(<GuestDetailsForm {...propsWithSlug} />);

      await triggerRecognition(screen.getByTestId("email"), "jane@example.com");

      expect(mockApi.publicVenue.recognizeGuest).toHaveBeenCalled();
      expect(screen.queryByTestId("recognition-banner")).toBeNull();
    });

    it("silently swallows API errors (e.g. rate limited)", async () => {
      mockApi.publicVenue.recognizeGuest.mockRejectedValue(new Error("Rate limited"));

      render(<GuestDetailsForm {...propsWithSlug} />);

      await triggerRecognition(screen.getByTestId("email"), "jane@example.com");

      expect(mockApi.publicVenue.recognizeGuest).toHaveBeenCalled();
      expect(screen.queryByTestId("recognition-banner")).toBeNull();
    });

    it("does not call recognize when venueSlug is not provided", async () => {
      render(<GuestDetailsForm {...defaultProps} />);

      await triggerRecognition(screen.getByTestId("email"), "jane@example.com");

      expect(mockApi.publicVenue.recognizeGuest).not.toHaveBeenCalled();
    });

    it("auto-filled name remains editable; phone is never pre-filled", async () => {
      mockApi.publicVenue.recognizeGuest.mockResolvedValue({
        recognized: true,
        firstName: "Jane",
        visitCount: 1,
        hasPreferences: false,
      });

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

      // The recognized name counts as a valid name on submit
      fireEvent.click(screen.getByTestId("submit-button"));
      expect(screen.getByTestId("name").getAttribute("aria-invalid")).toBeNull();
      expect(propsWithSlug.onSubmit).toHaveBeenCalledWith({
        name: "Jane",
        email: "jane@example.com",
        phone: "555-111-2222",
        notes: "",
      });
    });
  });
});
