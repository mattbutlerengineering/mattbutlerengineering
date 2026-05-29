import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
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
    onBlur?: () => void;
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
  Alert: ({
    children,
    variant,
    "data-testid": testId,
  }: {
    children?: React.ReactNode;
    variant?: string;
    "data-testid"?: string;
  }) => (
    <div data-testid={testId ?? "alert"} data-variant={variant}>
      {children}
    </div>
  ),
  Text: ({
    children,
    className,
    variant,
    color,
    "data-testid": testId,
  }: {
    children?: React.ReactNode;
    className?: string;
    variant?: string;
    color?: string;
    "data-testid"?: string;
  }) => (
    <div
      data-testid={testId ?? "text"}
      className={className}
      data-variant={variant}
      data-color={color}
    >
      {children}
    </div>
  ),
}));

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
    fireEvent.change(screen.getByTestId("email"), { target: { value: "john@example.com" } });
    const submitButton = screen.getByTestId("submit-button");
    expect(submitButton).not.toBeDisabled();
  });

  it("should enable submit when name and phone are provided", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    fireEvent.change(screen.getByTestId("name"), { target: { value: "John" } });
    fireEvent.change(screen.getByTestId("phone"), { target: { value: "555-123-4567" } });
    const submitButton = screen.getByTestId("submit-button");
    expect(submitButton).not.toBeDisabled();
  });

  it("should call onSubmit with form data when submitted", () => {
    render(<GuestDetailsForm {...defaultProps} />);
    fireEvent.change(screen.getByTestId("name"), { target: { value: "John Doe" } });
    fireEvent.change(screen.getByTestId("email"), { target: { value: "john@example.com" } });
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

  describe("guest recognition", () => {
    const recognizedGuest = {
      recognized: true,
      firstName: "Jane",
      phone: "+15559876543",
      visitCount: 3,
      hasPreferences: true,
      lastVisit: "2025-12-01T00:00:00Z",
    };

    it("shows welcome banner when recognition is recognized", () => {
      render(<GuestDetailsForm {...defaultProps} recognition={recognizedGuest} />);
      expect(screen.getByTestId("recognition-banner")).toBeDefined();
      expect(screen.getByText(/welcome back, jane/i)).toBeDefined();
    });

    it("shows visit count in banner when visitCount > 1", () => {
      render(<GuestDetailsForm {...defaultProps} recognition={recognizedGuest} />);
      expect(screen.getByText(/you've visited 3 times/i)).toBeDefined();
    });

    it("shows preferences note when hasPreferences is true", () => {
      render(<GuestDetailsForm {...defaultProps} recognition={recognizedGuest} />);
      expect(screen.getByText(/your preferences are on file/i)).toBeDefined();
    });

    it("does not show banner when recognized is false", () => {
      const unrecognized = { ...recognizedGuest, recognized: false };
      render(<GuestDetailsForm {...defaultProps} recognition={unrecognized} />);
      expect(screen.queryByTestId("recognition-banner")).toBeNull();
    });

    it("does not show banner when recognition is null", () => {
      render(<GuestDetailsForm {...defaultProps} recognition={null} />);
      expect(screen.queryByTestId("recognition-banner")).toBeNull();
    });

    it("auto-fills name from recognition when field is empty", () => {
      render(<GuestDetailsForm {...defaultProps} recognition={recognizedGuest} />);
      expect((screen.getByTestId("name") as HTMLInputElement).value).toBe("Jane");
    });

    it("auto-fills phone from recognition when field is empty", () => {
      render(<GuestDetailsForm {...defaultProps} recognition={recognizedGuest} />);
      expect((screen.getByTestId("phone") as HTMLInputElement).value).toBe("+15559876543");
    });

    it("does not overwrite name when user has already typed", () => {
      const { rerender } = render(<GuestDetailsForm {...defaultProps} recognition={null} />);
      fireEvent.change(screen.getByTestId("name"), { target: { value: "Bob" } });
      rerender(<GuestDetailsForm {...defaultProps} recognition={recognizedGuest} />);
      expect((screen.getByTestId("name") as HTMLInputElement).value).toBe("Bob");
    });

    it("does not overwrite phone when user has already typed", () => {
      const { rerender } = render(<GuestDetailsForm {...defaultProps} recognition={null} />);
      fireEvent.change(screen.getByTestId("phone"), { target: { value: "555-111-2222" } });
      rerender(<GuestDetailsForm {...defaultProps} recognition={recognizedGuest} />);
      expect((screen.getByTestId("phone") as HTMLInputElement).value).toBe("555-111-2222");
    });

    it("calls onEmailBlur when email input loses focus", () => {
      const onEmailBlur = vi.fn();
      render(<GuestDetailsForm {...defaultProps} onEmailBlur={onEmailBlur} />);
      fireEvent.change(screen.getByTestId("email"), { target: { value: "jane@example.com" } });
      fireEvent.blur(screen.getByTestId("email"));
      expect(onEmailBlur).toHaveBeenCalledWith("jane@example.com");
    });

    it("does not call onEmailBlur when email is empty", () => {
      const onEmailBlur = vi.fn();
      render(<GuestDetailsForm {...defaultProps} onEmailBlur={onEmailBlur} />);
      fireEvent.blur(screen.getByTestId("email"));
      expect(onEmailBlur).not.toHaveBeenCalled();
    });

    it("shows loading indicator when recognitionLoading is true", () => {
      render(<GuestDetailsForm {...defaultProps} recognitionLoading={true} />);
      expect(screen.getByTestId("recognition-loading")).toBeDefined();
    });

    it("hides loading indicator when recognitionLoading is false", () => {
      render(<GuestDetailsForm {...defaultProps} recognitionLoading={false} />);
      expect(screen.queryByTestId("recognition-loading")).toBeNull();
    });
  });
});
