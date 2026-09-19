/* eslint-disable @typescript-eslint/no-explicit-any */
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
  Button: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => (
    <button {...props}>{children}</button>
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

  it("groups party size buttons under an accessible group name", () => {
    render(<DatePartySelector {...defaultProps} />);
    expect(screen.getByRole("group", { name: /party size/i })).toBeDefined();
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

  // #4979: the option grid used to be a hardcoded 1-8 array filtered down —
  // never expanded — so a venue with a real cap above 8 silently turned away
  // parties of 9-12 with no way to select them at all.
  it("renders party size buttons beyond 8 when the venue's maxPartySize is higher", () => {
    render(<DatePartySelector {...defaultProps} maxPartySize={12} />);
    for (let i = 1; i <= 12; i++) {
      expect(screen.getByText(String(i))).toBeDefined();
    }
  });

  it("disables 'Find Available Times' when no date is selected", () => {
    render(<DatePartySelector {...defaultProps} selectedDate={null} />);
    const btn = screen.getByText("Find Available Times");
    expect(btn).toHaveProperty("disabled", true);
  });

  it("enables 'Find Available Times' when date is selected", () => {
    render(<DatePartySelector {...defaultProps} selectedDate="2026-05-20" minDate="2020-01-01" />);
    const btn = screen.getByText("Find Available Times");
    expect(btn).toHaveProperty("disabled", false);
  });

  // #4981: the date input's `min` attribute only guides the native picker —
  // a typed (or pasted) past date must still be rejected by canProceed.
  it("disables 'Find Available Times' when the selected date is before minDate", () => {
    render(<DatePartySelector {...defaultProps} selectedDate="2026-05-19" minDate="2026-05-20" />);
    const btn = screen.getByText("Find Available Times");
    expect(btn).toHaveProperty("disabled", true);
  });

  it("shows a hint explaining why the CTA is disabled for a past date", () => {
    render(<DatePartySelector {...defaultProps} selectedDate="2026-05-19" minDate="2026-05-20" />);
    expect(screen.getByText(/choose a date from today onward/i)).toBeDefined();
  });

  it("does not show the date hint once a valid date is selected", () => {
    render(<DatePartySelector {...defaultProps} selectedDate="2026-05-20" minDate="2026-05-20" />);
    expect(screen.queryByText(/choose a date from today onward/i)).toBeNull();
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
    render(
      <DatePartySelector
        {...defaultProps}
        selectedDate="2026-05-20"
        minDate="2020-01-01"
        onNext={onNext}
      />
    );
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
      <DatePartySelector {...defaultProps} enableDateRange={true} selectedDate="2026-05-20" />
    );
    expect(screen.getByLabelText("Start Date")).toBeDefined();
    expect(screen.queryByLabelText("End Date")).toBeNull();
  });

  // #4979: parties who genuinely exceed the venue's real cap need a reachable
  // way to say so, and a real number to call — not a sentence that renders
  // only for a size nobody can ever select.
  describe("parties larger than maxPartySize", () => {
    it("renders a reachable overflow option beyond maxPartySize", () => {
      render(<DatePartySelector {...defaultProps} maxPartySize={8} />);
      expect(screen.getByText("8+")).toBeDefined();
    });

    it("selects an overflow party size when the overflow option is clicked", () => {
      const onPartySizeChange = vi.fn();
      render(
        <DatePartySelector
          {...defaultProps}
          maxPartySize={8}
          onPartySizeChange={onPartySizeChange}
        />
      );
      fireEvent.click(screen.getByText("8+"));
      expect(onPartySizeChange).toHaveBeenCalledWith(9);
    });

    it("renders the venue phone as a tel: link when the party exceeds maxPartySize", () => {
      render(
        <DatePartySelector {...defaultProps} maxPartySize={8} partySize={9} phone="+1-555-0100" />
      );
      const link = screen.getByText("+1-555-0100");
      expect(link.closest("a")?.getAttribute("href")).toBe("tel:+1-555-0100");
    });

    it("falls back to a generic contact message when no phone is configured", () => {
      render(<DatePartySelector {...defaultProps} maxPartySize={8} partySize={9} />);
      expect(screen.getByText(/contact the venue directly/i)).toBeDefined();
      expect(screen.queryByRole("link")).toBeNull();
    });

    it("disables 'Find Available Times' when the overflow option is selected", () => {
      render(
        <DatePartySelector
          {...defaultProps}
          maxPartySize={8}
          partySize={9}
          selectedDate="2026-05-20"
        />
      );
      const btn = screen.getByText("Find Available Times");
      expect(btn).toHaveProperty("disabled", true);
    });
  });

  // #4981: "today" for the min-date bound must track the venue's clock, not
  // the guest's device or a UTC midnight boundary.
  describe("venueTimezone", () => {
    it("computes the date input's min bound from the venue's timezone", () => {
      vi.useFakeTimers();
      // 2026-01-01T04:30:00Z is still 2025-12-31 in America/Los_Angeles.
      vi.setSystemTime(new Date("2026-01-01T04:30:00Z"));
      try {
        render(<DatePartySelector {...defaultProps} venueTimezone="America/Los_Angeles" />);
        expect(screen.getByLabelText("Date").getAttribute("min")).toBe("2025-12-31");
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
