import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import { AvailabilitySelectionBar } from "./AvailabilitySelectionBar.js";

const SIX = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"];

function renderBar(props: Partial<React.ComponentProps<typeof AvailabilitySelectionBar>> = {}) {
  const onEditHours = vi.fn();
  const onClear = vi.fn();
  const utils = render(
    <main>
      <AvailabilitySelectionBar
        selection={SIX}
        canEdit
        onEditHours={onEditHours}
        onClear={onClear}
        {...props}
      />
    </main>
  );
  return { ...utils, onEditHours, onClear };
}

describe("AvailabilitySelectionBar", () => {
  it("announces the count politely", () => {
    renderBar();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("6 dates selected");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("uses the singular for one date", () => {
    renderBar({ selection: ["2026-10-30"] });
    expect(screen.getByRole("status")).toHaveTextContent("1 date selected");
  });

  it("hands the selection to the drawer when Edit hours is pressed", () => {
    const { onEditHours } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Edit hours" }));
    expect(onEditHours).toHaveBeenCalledWith(SIX);
  });

  it("clears with the close button", () => {
    const { onClear } = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("offers no editing to someone who cannot edit", () => {
    renderBar({ canEdit: false });
    expect(screen.queryByRole("button", { name: "Edit hours" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeInTheDocument();
  });

  it("offers Use another day's hours with one schedule and Use schedule with several", () => {
    const onUseSchedule = vi.fn();
    const { rerender } = renderBar({ onUseSchedule, multipleSchedules: false });
    fireEvent.click(screen.getByRole("button", { name: "Use another day’s hours" }));
    expect(onUseSchedule).toHaveBeenCalledOnce();
    rerender(
      <main>
        <AvailabilitySelectionBar
          selection={SIX}
          canEdit
          onEditHours={vi.fn()}
          onClear={vi.fn()}
          onUseSchedule={onUseSchedule}
          multipleSchedules
        />
      </main>
    );
    expect(screen.getByRole("button", { name: "Use schedule" })).toBeInTheDocument();
  });

  it("opens Clear changes when the selection has changes of its own", () => {
    const onClearChanges = vi.fn();
    renderBar({ onClearChanges, canClearChanges: true });
    fireEvent.click(screen.getByRole("button", { name: "Clear changes" }));
    expect(onClearChanges).toHaveBeenCalledOnce();
  });

  it("disables Clear changes when no selected date has changes to clear", () => {
    renderBar({ onClearChanges: vi.fn(), canClearChanges: false });
    expect(screen.getByRole("button", { name: "Clear changes" })).toBeDisabled();
  });

  it("hides both schedule actions from someone who cannot edit", () => {
    renderBar({ canEdit: false, onUseSchedule: vi.fn(), onClearChanges: vi.fn() });
    expect(screen.queryByRole("button", { name: "Clear changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Use/ })).not.toBeInTheDocument();
  });

  it("keeps an empty live region mounted so the first selection is announced", () => {
    renderBar({ selection: [] });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderBar();
    expect(
      (await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations
    ).toEqual([]);
  });
});
