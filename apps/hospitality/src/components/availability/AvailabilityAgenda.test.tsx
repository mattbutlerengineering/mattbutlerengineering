import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import type { AvailabilityDaySummary } from "@mbe/types";
import { AvailabilityAgenda, type AvailabilityAgendaProps } from "./AvailabilityAgenda.js";

// jsdom cannot compute colour contrast; the rule under test is the name/visible-text match.
const AXE_NAME = {
  rules: {
    "color-contrast": { enabled: false },
    "label-content-name-mismatch": { enabled: true },
  },
};

const OPEN = { online: true, phone: true, waitlist: true };

function day(date: string): AvailabilityDaySummary {
  return {
    serviceDate: date,
    label: "Regular week",
    scheduleId: "reg",
    serviceCount: 1,
    closures: [],
    bookingOpen: OPEN,
    services: [],
  };
}

function renderAgenda(overrides: Partial<AvailabilityAgendaProps> = {}) {
  const dates = ["2026-11-25", "2026-11-26"];
  return render(
    <main>
      <AvailabilityAgenda
        dates={dates}
        label="November 2026"
        byDate={new Map(dates.map((d) => [d, day(d)]))}
        today="2026-11-20"
        picked={new Set()}
        isLoading={false}
        handlersFor={() => ({}) as ReturnType<AvailabilityAgendaProps["handlersFor"]>}
        onToggle={vi.fn()}
        holidays={new Map([["2026-11-26", "Thanksgiving"]])}
        serviceFilter={null}
        {...overrides}
      />
    </main>
  );
}

describe("AvailabilityAgenda holiday rows (WCAG 2.5.3)", () => {
  it("names a holiday row with its visible date and holiday first", () => {
    renderAgenda();
    expect(screen.getByRole("button", { name: /^Thu, Nov 26 Thanksgiving: / })).toBeInTheDocument();
  });

  it("keeps a space between the visible date and the holiday", () => {
    const { container } = renderAgenda();
    const row = container.querySelector('button[data-date="2026-11-26"]');
    expect(row?.textContent).toMatch(/^Thu, Nov 26 Thanksgiving/);
  });

  it("passes axe label-content-name-mismatch with a holiday on screen", async () => {
    const { container } = renderAgenda();
    expect((await axe(container, AXE_NAME)).violations).toEqual([]);
  });

  it("leaves a plain day's name unchanged", () => {
    renderAgenda();
    expect(screen.getByRole("button", { name: /^Wed, Nov 25: / })).toBeInTheDocument();
  });
});
