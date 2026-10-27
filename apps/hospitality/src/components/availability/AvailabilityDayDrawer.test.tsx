import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import type { ResolvedDay } from "@mbe/availability";
import { AvailabilityDayDrawer } from "./AvailabilityDayDrawer.js";
import {
  EARLY_DINNER,
  LATE_CLOSURE,
  LUNCH_WINDOW,
  ONLINE_CLOSURE,
  ONLINE_WINDOW,
  PARTY_CLOSURE,
  SKIP_WEEKLY,
  WEEKLY_CLOSURE,
  resolveFixtureDay,
} from "./resolved-day-fixtures.js";

// jsdom cannot compute colour contrast; token contrast is covered in rialto.
const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

// Real engine output, so every "removalResult" is what the engine would resolve.
const STACKED: ResolvedDay = resolveFixtureDay(EARLY_DINNER, PARTY_CLOSURE, ONLINE_CLOSURE);
const REGULAR_ONLY: ResolvedDay = resolveFixtureDay();
const CLOSED: ResolvedDay = { ...REGULAR_ONLY, services: [], explanation: [] };

type Props = React.ComponentProps<typeof AvailabilityDayDrawer>;

function renderDrawer(props: Partial<Props> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <main>
      <AvailabilityDayDrawer
        date="2026-10-30"
        day={STACKED}
        isLoading={false}
        error={null}
        viewerRole="manager"
        onClose={onClose}
        {...props}
      />
    </main>
  );
  return { ...utils, onClose };
}

function setViewportWidth(width: number) {
  window.matchMedia = vi.fn((query: string) => {
    const max = /\(max-width:\s*(\d+)px\)/.exec(query);
    return {
      media: query,
      matches: max ? width <= Number(max[1]) : false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  }) as unknown as typeof window.matchMedia;
}

describe("AvailabilityDayDrawer", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("is full screen on a phone (ux.md S2)", () => {
    setViewportWidth(390);
    renderDrawer();
    expect(screen.getByRole("dialog").className).toMatch(/full/);
  });

  it("keeps the side-panel width on a desktop", () => {
    setViewportWidth(1280);
    renderDrawer();
    expect(screen.getByRole("dialog").className).not.toMatch(/full/);
  });

  it("titles the drawer with the date and opens with a plain summary", () => {
    renderDrawer();
    const dialog = screen.getByRole("dialog", { name: /Friday, October 30/ });
    expect(within(dialog).getByText("Open for Lunch and Dinner.")).toBeInTheDocument();
    expect(within(dialog).getByText("3 changes from your regular Friday.")).toBeInTheDocument();
  });

  it("lists the layer stack bottom-up, each with what removing it would do", () => {
    renderDrawer();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Why this day" })).toBeInTheDocument();
    const layers = within(dialog).getAllByRole("listitem");
    expect(layers.map((l) => l.querySelector("[data-layer-label]")?.textContent)).toHaveLength(4);
    const removed = layers.map((l) => l.textContent ?? "");
    expect(removed[0]).toContain("If removed: no change to this day");
    expect(removed[1]).toContain(
      "If removed: Dinner back to 11:00 PM and Dinner last seating 9:00 PM"
    );
    expect(removed[2]).toContain("If removed: reopens 10:00 PM – 11:00 PM");
    expect(removed[3]).toContain("If removed: online booking back on");
  });

  it("shows only the plain summary while the regular week is the sole layer", () => {
    renderDrawer({ day: REGULAR_ONLY });
    expect(screen.queryByRole("heading", { name: "Why this day" })).not.toBeInTheDocument();
    expect(screen.getByText("Open for Lunch and Dinner.")).toBeInTheDocument();
  });

  it("explains a closed day with no layers", () => {
    renderDrawer({ day: CLOSED });
    expect(
      screen.getByText("Closed. Your regular week has no hours on Friday.")
    ).toBeInTheDocument();
  });

  it("gives a Host the view-only note and no edit controls", () => {
    renderDrawer({ viewerRole: "host" });
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Only managers change hours. For tonight, use the Tonight panel.")
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: /remove|edit|save|close…/i })
    ).not.toBeInTheDocument();
  });

  it("does not show the Host note to a Manager", () => {
    renderDrawer({ viewerRole: "manager" });
    expect(screen.queryByText(/Only managers change hours/)).not.toBeInTheDocument();
  });

  it("shows a skeleton while loading and an alert on error", () => {
    const { rerender, onClose } = renderDrawer({ day: undefined, isLoading: true });
    expect(screen.queryByText("Why this day")).not.toBeInTheDocument();
    rerender(
      <main>
        <AvailabilityDayDrawer
          date="2026-10-30"
          day={undefined}
          isLoading={false}
          error="Network down"
          viewerRole="host"
          onClose={onClose}
        />
      </main>
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load why this day looks this way"
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Network down");
  });

  it("renders nothing when no day is open", () => {
    renderDrawer({ date: null, day: undefined });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes from Escape", () => {
    const { onClose } = renderDrawer();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("has no axe violations", async () => {
    renderDrawer({ viewerRole: "host" });
    expect((await axe(document.body, AXE_OPTIONS)).violations).toEqual([]);
  });
});

describe("AvailabilityDayDrawer windowed closure wording", () => {
  function removedTexts(day: ResolvedDay): string[] {
    renderDrawer({ day });
    return within(screen.getByRole("dialog"))
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
  }

  it("says the channel is back on, not that the venue reopens", () => {
    const texts = removedTexts(resolveFixtureDay(ONLINE_WINDOW));
    expect(texts[1]).toContain("If removed: online booking back on 6:00 PM – 7:00 PM");
  });

  it("names the service that reopens", () => {
    const texts = removedTexts(resolveFixtureDay(LUNCH_WINDOW));
    expect(texts[1]).toContain("If removed: Lunch reopens 12:00 PM – 1:00 PM");
  });

  it("reads a venue window as reopens, with the next-day marker past midnight", () => {
    const texts = removedTexts(resolveFixtureDay(LATE_CLOSURE));
    expect(texts[1]).toContain("If removed: reopens 11:00 PM – 1:00 AM (next day)");
  });

  it("keeps a re-applied closure lowercase inside the list", () => {
    const texts = removedTexts(resolveFixtureDay(WEEKLY_CLOSURE, SKIP_WEEKLY));
    expect(texts[1]).toContain("If removed: closed 10:00 PM – 11:00 PM");
    expect(texts[1]).not.toContain("Closed 10:00");
  });
});
