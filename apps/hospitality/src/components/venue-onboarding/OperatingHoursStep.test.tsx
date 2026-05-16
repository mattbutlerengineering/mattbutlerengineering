/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { OperatingHoursStep, validateOperatingHours } from "./OperatingHoursStep.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Text: ({ children }: any) => <Text>{children}</Text>,
  Checkbox: ({ label, checked, onCheckedChange }: any) => (
    <label>
      <Input
        type="checkbox"
        checked={checked}
        onChange={() => onCheckedChange?.()}
        data-testid={`checkbox-${label}`}
      />
      {label}
    </label>
  ),
  ConfirmDialog: ({ open, title, onConfirm, onCancel, confirmLabel }: any) =>
    open ? (
      <div data-testid="confirm-dialog">
        <Text>{title}</Text>
        <Button onClick={onConfirm}>{confirmLabel}</Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    ) : null,
}));

vi.mock("./venue-onboarding.module.css", () => ({
  default: {
    stepContainer: "stepContainer",
    dayRow: "dayRow",
    dayCheckbox: "dayCheckbox",
    dayTimesColumn: "dayTimesColumn",
    dayTimes: "dayTimes",
    timeInput: "timeInput",
    timeInputError: "timeInputError",
    closedText: "closedText",
    errorText: "errorText",
  },
}));

describe("OperatingHoursStep", () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders time inputs for enabled days", () => {
    render(
      <OperatingHoursStep
        data={{ monday: { open: "09:00", close: "22:00" } }}
        onChange={onChange}
      />
    );
    expect(screen.getByLabelText("monday opening time")).toBeDefined();
    expect(screen.getByLabelText("monday closing time")).toBeDefined();
  });

  it("shows Closed for disabled days", () => {
    render(<OperatingHoursStep data={{}} onChange={onChange} />);
    const closedTexts = screen.getAllByText("Closed");
    expect(closedTexts.length).toBe(7);
  });

  it("calls onChange when opening time changes", () => {
    render(
      <OperatingHoursStep
        data={{ monday: { open: "09:00", close: "22:00" } }}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByLabelText("monday opening time"), {
      target: { value: "10:00" },
    });
    expect(onChange).toHaveBeenCalledWith({
      monday: { open: "10:00", close: "22:00" },
    });
  });

  it("calls onChange when closing time changes", () => {
    render(
      <OperatingHoursStep
        data={{ monday: { open: "09:00", close: "22:00" } }}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByLabelText("monday closing time"), {
      target: { value: "23:00" },
    });
    expect(onChange).toHaveBeenCalledWith({
      monday: { open: "09:00", close: "23:00" },
    });
  });

  it("shows time error when close is before open", () => {
    render(
      <OperatingHoursStep
        data={{ monday: { open: "22:00", close: "09:00" } }}
        onChange={onChange}
      />
    );
    expect(screen.getByText("Closing time must be after opening time")).toBeDefined();
  });

  it("shows day error from errors prop", () => {
    render(
      <OperatingHoursStep
        data={{ monday: { open: "09:00", close: "22:00" } }}
        errors={{ days: { monday: "Custom error" } }}
        onChange={onChange}
      />
    );
    expect(screen.getByText("Custom error")).toBeDefined();
  });

  it("shows global error", () => {
    render(
      <OperatingHoursStep
        data={{}}
        errors={{ global: "At least one day must be open" }}
        onChange={onChange}
      />
    );
    expect(screen.getByText("At least one day must be open")).toBeDefined();
  });

  it("shows confirm dialog when disabling day with custom times", () => {
    render(
      <OperatingHoursStep
        data={{ monday: { open: "10:00", close: "23:00" } }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByTestId("checkbox-monday"));
    expect(screen.getByTestId("confirm-dialog")).toBeDefined();
    expect(screen.getByText("Close monday?")).toBeDefined();
  });

  it("confirms closing day with custom times", () => {
    render(
      <OperatingHoursStep
        data={{ monday: { open: "10:00", close: "23:00" } }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByTestId("checkbox-monday"));
    fireEvent.click(screen.getByText("Close Day"));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("cancels confirm dialog", () => {
    render(
      <OperatingHoursStep
        data={{ monday: { open: "10:00", close: "23:00" } }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByTestId("checkbox-monday"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });

  it("disables default-time day without confirm dialog", () => {
    render(
      <OperatingHoursStep
        data={{ monday: { open: "09:00", close: "22:00" } }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByTestId("checkbox-monday"));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("re-enables day with default schedule", () => {
    render(<OperatingHoursStep data={{}} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("checkbox-monday"));
    expect(onChange).toHaveBeenCalledWith({
      monday: { open: "09:00", close: "22:00" },
    });
  });
});

describe("validateOperatingHours", () => {
  it("returns null for valid hours", () => {
    expect(validateOperatingHours({ monday: { open: "09:00", close: "22:00" } })).toBeNull();
  });

  it("returns day error for close before open", () => {
    const result = validateOperatingHours({
      monday: { open: "22:00", close: "09:00" },
    });
    expect(result?.days?.monday).toBe("Closing time must be after opening time");
  });

  it("returns global error when no days enabled", () => {
    const result = validateOperatingHours({});
    expect(result?.global).toBe("At least one day must be open");
  });

  it("returns both global and day errors when no days enabled but some have time errors", () => {
    const result = validateOperatingHours({});
    expect(result?.global).toBeDefined();
  });
});
