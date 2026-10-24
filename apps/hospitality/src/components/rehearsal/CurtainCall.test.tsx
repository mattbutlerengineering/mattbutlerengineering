import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CurtainCall } from "./CurtainCall.js";
import type { RehearsalMetrics } from "./rehearsal-state.js";

const METRICS: RehearsalMetrics = {
  coversServed: 142,
  averageTurnMinutes: 78,
  peakHour: 19,
  tablesNeverSat: 3,
  longestWalkInWaitMinutes: 25,
};

function setup(metrics: RehearsalMetrics = METRICS) {
  const props = { metrics, onRunAgain: vi.fn(), onTryWeeknight: vi.fn() };
  render(<CurtainCall {...props} />);
  return props;
}

describe("CurtainCall", () => {
  it("shows each metric from the reducer", () => {
    setup();
    expect(screen.getByText("142")).toBeInTheDocument();
    expect(screen.getByText("78 min")).toBeInTheDocument();
    expect(screen.getByText("7 PM")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("25 min")).toBeInTheDocument();
  });

  it("labels the five metrics", () => {
    setup();
    for (const label of [
      "Covers served",
      "Average turn time",
      "Peak hour",
      "Tables that never sat",
      "Longest walk-in wait",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows a dash for the peak hour when nobody sat", () => {
    setup({ ...METRICS, peakHour: null });
    expect(screen.getByRole("group", { name: "Peak hour, unavailable" })).toBeInTheDocument();
  });

  it("re-seeds on Run it again", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Run it again" }));
    expect(props.onRunAgain).toHaveBeenCalledOnce();
  });

  it("switches profile on Try a weeknight", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Try a weeknight" }));
    expect(props.onTryWeeknight).toHaveBeenCalledOnce();
  });
});
