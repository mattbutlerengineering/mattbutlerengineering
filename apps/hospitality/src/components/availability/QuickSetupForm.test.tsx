import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QuickSetupCard } from "./QuickSetupCard.js";
import type { QuickSetupDraft } from "./quick-setup-draft.js";

function renderCard() {
  const onSave = vi.fn<(draft: QuickSetupDraft) => Promise<void>>(() => Promise.resolve());
  render(
    <main>
      <QuickSetupCard onSave={onSave} errorMessage={null} />
    </main>
  );
  return { onSave };
}

const DIFFERENT_DAYS = "Different days for this service";

describe("QuickSetupForm per-service days", () => {
  it("keeps every disclosure closed, so no control is duplicated", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Add another service" }));
    expect(screen.getAllByRole("button", { name: DIFFERENT_DAYS })).toHaveLength(2);
    for (const button of screen.getAllByRole("button", { name: DIFFERENT_DAYS })) {
      expect(button).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.getAllByRole("group", { name: "Days" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Weekdays" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Dinner" })).toHaveLength(2); // one chip per service
    expect(screen.getAllByLabelText("Opens")).toHaveLength(2);
    expect(screen.getAllByLabelText("Closes")).toHaveLength(2);
    expect(screen.getAllByLabelText("Last seating")).toHaveLength(2);
    expect(screen.getAllByLabelText("Service name")).toHaveLength(2);
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);
  });

  it("gives Lunch Mon–Fri and Brunch Sat–Sun their own days", async () => {
    const { onSave } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Lunch" }));
    fireEvent.click(screen.getByRole("button", { name: "Every day" }));
    fireEvent.click(screen.getByRole("button", { name: "Add another service" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Brunch" })[1]!);

    const toggles = screen.getAllByRole("button", { name: DIFFERENT_DAYS });
    fireEvent.click(toggles[0]!);
    const lunchDays = screen.getByRole("group", { name: "Lunch runs on" });
    // Opened with the days the service follows now: every day.
    expect(
      within(lunchDays)
        .getAllByRole("checkbox")
        .filter((c) => (c as HTMLInputElement).checked)
    ).toHaveLength(7);
    fireEvent.click(within(lunchDays).getByRole("button", { name: "Weekdays" }));

    fireEvent.click(screen.getAllByRole("button", { name: DIFFERENT_DAYS })[1]!);
    const brunchDays = screen.getByRole("group", { name: "Brunch runs on" });
    fireEvent.click(within(brunchDays).getByRole("button", { name: "Weekends" }));

    // Every service has its own days, so the shared field no longer asks for them.
    expect(screen.getByText("Every service has its own days.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save and open bookings" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0]![0];
    expect(saved.services.map((s) => s.days)).toEqual([
      [1, 2, 3, 4, 5],
      [6, 0],
    ]);
  });

  it("moves focus into the days on open and back to the button on close", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
    fireEvent.click(screen.getByRole("button", { name: "Weekdays" }));
    const toggle = screen.getByRole("button", { name: DIFFERENT_DAYS });
    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const group = screen.getByRole("group", { name: "Dinner runs on" });
    expect(within(group).getAllByRole("checkbox")[0]).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Use the shared days" }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
    expect(screen.queryByRole("group", { name: "Dinner runs on" })).not.toBeInTheDocument();
  });

  it("asks for at least one day for a service with its own days", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
    fireEvent.click(screen.getByRole("button", { name: DIFFERENT_DAYS }));
    // Shared days were empty, so the service starts with no day.
    fireEvent.click(screen.getByRole("button", { name: "Save and open bookings" }));
    expect(screen.getByText("Choose at least one day for Dinner.")).toBeInTheDocument();
  });
});
