import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import type { LostDemand, LostDemandWhatIf } from "@mbe/types";
import { SeatingWhatIf } from "./SeatingWhatIf.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Card: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <section>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  ),
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Skeleton: () => <div data-testid="skeleton" />,
  Select: ({
    label,
    value,
    options,
    onChange,
  }: {
    label?: string;
    value?: string;
    options: { value: string; label: string }[];
    onChange?: (v: string) => void;
  }) => (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange?.(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));

vi.mock("../ErrorRetryBanner", () => ({
  ErrorRetryBanner: ({ title }: { title: string }) => <div role="alert">{title}</div>,
}));

const useWhatIf = vi.fn();
vi.mock("../../hooks/useLostDemandWhatIf.js", () => ({
  useLostDemandWhatIf: (params: unknown) => useWhatIf(params),
}));

const demand: LostDemand = {
  venueId: "v1",
  from: "2026-10-28",
  to: "2026-11-24",
  total: 12,
  cells: [
    { weekday: 2, hour: 21, searches: 7 },
    { weekday: 5, hour: 19, searches: 3 },
  ],
  anyTime: [{ weekday: 2, searches: 2 }],
};

const estimate: LostDemandWhatIf = {
  venueId: "v1",
  from: "2026-10-28",
  to: "2026-11-24",
  weekday: 2,
  minute: 21 * 60 + 30,
  outcome: "estimated",
  searches: 7,
  windowStart: 21 * 60,
  windowEnd: 22 * 60,
  minParty: null,
  maxParty: null,
  anyTimeSearches: 3,
};

const ready = (data: LostDemandWhatIf) =>
  useWhatIf.mockReturnValue({ data, isLoading: false, error: null, refetch: vi.fn() });

describe("SeatingWhatIf", () => {
  beforeEach(() => {
    useWhatIf.mockReset();
    ready(estimate);
  });

  it("starts on the busiest weekday and half past its hour", () => {
    render(<SeatingWhatIf venueId="v1" demand={demand} />);

    expect(useWhatIf).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "v1", weekday: 2, time: "21:30" })
    );
    expect(screen.getByLabelText(/weekday/i)).toHaveValue("2");
    expect(screen.getByLabelText(/^time/i)).toHaveValue("21:30");
  });

  it("labels the number an estimate and states the method in plain words", () => {
    render(<SeatingWhatIf venueId="v1" demand={demand} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/estimate/i);
    expect(status).toHaveTextContent(/7 searches/i);
    expect(status).toHaveTextContent(/last 28 days/i);
    expect(status).toHaveTextContent(/found no table/i);
    expect(status).toHaveTextContent(/9:00.*10:00/);
    expect(status).toHaveTextContent(/every Tuesday/);
  });

  it("keeps whole-day misses apart from the count", () => {
    render(<SeatingWhatIf venueId="v1" demand={demand} />);

    expect(screen.getByRole("status")).toHaveTextContent(/3 more searches.*named no time/i);
  });

  it("asks again with the new pick, and the party range, when a control changes", () => {
    render(<SeatingWhatIf venueId="v1" demand={demand} />);

    fireEvent.change(screen.getByLabelText(/^time/i), { target: { value: "22:00" } });
    fireEvent.change(screen.getByLabelText(/party/i), { target: { value: "3-4" } });

    expect(useWhatIf).toHaveBeenLastCalledWith(
      expect.objectContaining({ weekday: 2, time: "22:00", minParty: 3, maxParty: 4 })
    );
  });

  it("makes no claim while loading", () => {
    useWhatIf.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });
    render(<SeatingWhatIf venueId="v1" demand={demand} />);

    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
    const status = screen.getByRole("status");
    expect(status).not.toHaveTextContent(/estimate/i);
    expect(status).not.toHaveTextContent(/searches/i);
  });

  it("says nothing was caught when the estimate is zero", () => {
    ready({ ...estimate, searches: 0 });
    render(<SeatingWhatIf venueId="v1" demand={demand} />);

    expect(screen.getByRole("status")).toHaveTextContent(/would not have caught any/i);
  });

  it.each([
    ["closed", /no service/i],
    ["already_offered", /already/i],
    ["blocked", /another service/i],
  ] as const)("explains the %s outcome instead of a number", (outcome, text) => {
    ready({ ...estimate, outcome, searches: 0 });
    render(<SeatingWhatIf venueId="v1" demand={demand} />);

    expect(screen.getByRole("status")).toHaveTextContent(text);
    expect(screen.getByRole("status")).not.toHaveTextContent(/up to \d/i);
  });

  it("shows a retryable error, not a number, when the estimate fails", () => {
    useWhatIf.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("boom"),
      refetch: vi.fn(),
    });
    render(<SeatingWhatIf venueId="v1" demand={demand} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't estimate/i);
  });

  it("renders nothing when there is no turned-away demand to estimate against", () => {
    const { container } = render(
      <SeatingWhatIf venueId="v1" demand={{ ...demand, total: 0, cells: [], anyTime: [] }} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
