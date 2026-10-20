import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { CurtainCall, type CurtainCallProps } from "./CurtainCall";
import type { RehearsalMetrics } from "./rehearsal-state";

const METRICS: RehearsalMetrics = {
  coversServed: 148,
  avgTurnMinutes: 72,
  peakHour: 19,
  tablesNeverSat: ["t9", "t14"],
  longestWalkInWaitMinutes: 18,
};

function renderCard(overrides: Partial<CurtainCallProps> = {}) {
  const props: CurtainCallProps = {
    profile: "friday",
    metrics: METRICS,
    tableName: (id) => id.toUpperCase(),
    formatMinute: (m) => `${Math.floor(m / 60)}:00`,
    locale: "en-US",
    onRunAgain: vi.fn(),
    onTryOther: vi.fn(),
    onLeave: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <CurtainCall {...props} />
    </MemoryRouter>
  );
  return props;
}

describe("CurtainCall metrics (SC-7, rendered)", () => {
  it("is a labelled modal whose heading has focus", () => {
    renderCard();
    const dialog = screen.getByRole("dialog", { name: "Your Friday night" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("heading", { name: "Your Friday night" })).toHaveFocus();
  });

  it("shows the five metrics from the data", () => {
    renderCard();
    const dialog = screen.getByRole("dialog");
    const row = (label: string) => within(dialog).getByText(label).closest("div") as HTMLElement;
    expect(row("Covers served")).toHaveTextContent("148");
    expect(row("Average turn time")).toHaveTextContent("1 h 12 min");
    expect(row("Peak hour")).toHaveTextContent("19:00 to 20:00");
    expect(row("Tables that never sat")).toHaveTextContent("T9 and T14");
    expect(row("Longest walk-in wait")).toHaveTextContent("18 min");
    expect(
      within(dialog).getByText("This was a rehearsal. Nothing was saved.")
    ).toBeInTheDocument();
  });

  it.each([
    [45, "45 min"],
    [60, "1 h"],
    [125, "2 h 5 min"],
  ])("formats a %i-minute turn as %s", (minutes, text) => {
    renderCard({ metrics: { ...METRICS, avgTurnMinutes: minutes } });
    expect(screen.getByText("Average turn time").closest("div")).toHaveTextContent(text);
  });

  it("says every table sat when none were missed", () => {
    renderCard({ metrics: { ...METRICS, tablesNeverSat: [] } });
    expect(screen.getByText("Every table sat tonight.")).toBeInTheDocument();
  });

  it("says nobody waited rather than 0 minutes when there was no walk-in", () => {
    renderCard({ metrics: { ...METRICS, longestWalkInWaitMinutes: null } });
    expect(screen.getByText("Nobody waited.")).toBeInTheDocument();
    expect(screen.queryByText(/0 min/)).toBeNull();
  });

  it("explains a night that seated nobody", () => {
    renderCard({
      metrics: {
        coversServed: 0,
        avgTurnMinutes: null,
        peakHour: null,
        tablesNeverSat: ["t1"],
        longestWalkInWaitMinutes: null,
      },
    });
    expect(
      screen.getByText("Not enough tables to seat anyone. Add tables to your floor plan.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Floor plans" })).toHaveAttribute(
      "href",
      "/floor-plans"
    );
    expect(screen.queryByText("Covers served")).toBeNull();
  });
});

describe("CurtainCall actions", () => {
  it("offers Run it again, Try a weeknight and Leave after a Friday run", async () => {
    const props = renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Run it again" }));
    expect(props.onRunAgain).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Try a weeknight" }));
    expect(props.onTryOther).toHaveBeenCalledWith("weeknight");
    await userEvent.click(screen.getByRole("button", { name: "Leave rehearsal" }));
    expect(props.onLeave).toHaveBeenCalledTimes(1);
  });

  it("after a weeknight run: 'Your weeknight' and 'Try a Friday night'", async () => {
    const props = renderCard({ profile: "weeknight" });
    expect(screen.getByRole("heading", { name: "Your weeknight" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try a Friday night" }));
    expect(props.onTryOther).toHaveBeenCalledWith("friday");
    expect(screen.queryByRole("button", { name: "Try a weeknight" })).toBeNull();
  });
});

describe("CurtainCall dialog behaviour", () => {
  it("ignores Escape and closes only from its close button", async () => {
    const props = renderCard();
    await userEvent.keyboard("{Escape}");
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close summary" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Tab inside the card", async () => {
    renderCard();
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 12; i += 1) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 12; i += 1) {
      await userEvent.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });
});
