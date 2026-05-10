/* eslint-disable @typescript-eslint/no-explicit-any, react/jsx-no-undef */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DatePartySelector } from "./DatePartySelector.js";
import React from "react";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Input: (props: any) => {
    const id = props.id || props.label?.replace(/\s+/g, "-").toLowerCase() || "input";
    return (
      <div>
        <label htmlFor={id}>{props.label}</label>
        <input
          id={id}
          type={props.type}
          value={props.value}
          min={props.min}
          max={props.max}
          onChange={(e) => props.onChange?.({ target: { value: e.target.value } })}
        />
      </div>
    );
  },
  Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

vi.mock("@mbe/types", () => ({
  toDateString: (d: Date) => d.toISOString().split("T")[0],
}));

describe("DatePartySelector", () => {
  const defaultProps = {
    selectedDate: null as string | null,
    partySize: 2,
    onDateChange: vi.fn(),
    onPartySizeChange: vi.fn(),
    onNext: vi.fn(),
  };

  it("renders date input and party size options", () => {
    render(<DatePartySelector {...defaultProps} />);
    expect(screen.getByLabelText("Date")).toBeDefined();
    expect(screen.getByText("Party Size")).toBeDefined();
  });

  it("renders party size buttons 1-8 by default", () => {
    render(<DatePartySelector {...defaultProps} />);
    for (let i = 1; i <= 8; i++) {
      expect(screen.getByText(String(i))).toBeDefined();
    }
  });

  it("limits party size options to maxPartySize", () => {
    render(<DatePartySelector {...defaultProps} maxPartySize={4} />);
    expect(screen.getByText("4")).toBeDefined();
    expect(screen.queryByText("5")).toBeNull();
  });

  it("disables 'Find Available Times' when no date is selected", () => {
    render(<DatePartySelector {...defaultProps} selectedDate={null} />);
    const btn = screen.getByText("Find Available Times");
    expect(btn).toHaveProperty("disabled", true);
  });

  it("enables 'Find Available Times' when date is selected", () => {
    render(<DatePartySelector {...defaultProps} selectedDate="2026-05-20" />);
    const btn = screen.getByText("Find Available Times");
    expect(btn).toHaveProperty("disabled", false);
  });

  it("calls onDateChange when date is changed", () => {
    const onDateChange = vi.fn();
    render(<DatePartySelector {...defaultProps} onDateChange={onDateChange} />);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-05-25" } });
    expect(onDateChange).toHaveBeenCalledWith("2026-05-25");
  });

  it("calls onPartySizeChange when party size button is clicked", () => {
    const onPartySizeChange = vi.fn();
    render(<DatePartySelector {...defaultProps} onPartySizeChange={onPartySizeChange} />);
    fireEvent.click(screen.getByText("4"));
    expect(onPartySizeChange).toHaveBeenCalledWith(4);
  });

  it("marks selected party size with aria-pressed", () => {
    render(<DatePartySelector {...defaultProps} partySize={3} />);
    const btn3 = screen.getByText("3");
    expect(btn3.getAttribute("aria-pressed")).toBe("true");
    const btn4 = screen.getByText("4");
    expect(btn4.getAttribute("aria-pressed")).toBe("false");
  });

  it("calls onNext when submit button is clicked", () => {
    const onNext = vi.fn();
    render(<DatePartySelector {...defaultProps} selectedDate="2026-05-20" onNext={onNext} />);
    fireEvent.click(screen.getByText("Find Available Times"));
    expect(onNext).toHaveBeenCalled();
  });

  it("renders date range inputs when enableDateRange is true", () => {
    const onEndDateChange = vi.fn();
    render(
      <DatePartySelector
        {...defaultProps}
        enableDateRange={true}
        selectedDate="2026-05-20"
        selectedEndDate="2026-05-25"
        onEndDateChange={onEndDateChange}
      />
    );
    expect(screen.getByLabelText("Start Date")).toBeDefined();
    expect(screen.getByLabelText("End Date")).toBeDefined();
  });

  it("calls onEndDateChange when end date input changes", () => {
    const onEndDateChange = vi.fn();
    render(
      <DatePartySelector
        {...defaultProps}
        enableDateRange={true}
        selectedDate="2026-05-20"
        selectedEndDate=""
        onEndDateChange={onEndDateChange}
      />
    );
    fireEvent.change(screen.getByLabelText("End Date"), { target: { value: "2026-05-28" } });
    expect(onEndDateChange).toHaveBeenCalledWith("2026-05-28");
  });

  it("does not render end date input when enableDateRange is true but onEndDateChange is not provided", () => {
    render(
      <DatePartySelector
        {...defaultProps}
        enableDateRange={true}
        selectedDate="2026-05-20"
      />
    );
    expect(screen.getByLabelText("Start Date")).toBeDefined();
    expect(screen.queryByLabelText("End Date")).toBeNull();
  });
});
