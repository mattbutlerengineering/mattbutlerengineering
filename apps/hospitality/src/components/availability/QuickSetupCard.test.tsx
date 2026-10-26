import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { QuickSetupCard } from "./QuickSetupCard.js";

// jsdom cannot compute colour contrast; token contrast is covered in rialto.
const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

function renderCard(props: Partial<React.ComponentProps<typeof QuickSetupCard>> = {}) {
  const onSave = vi.fn(props.onSave ?? (() => Promise.resolve()));
  render(
    <main>
      <QuickSetupCard onSave={onSave} errorMessage={props.errorMessage ?? null} />
    </main>
  );
  return { onSave };
}

function bistroWeek() {
  fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
  fireEvent.click(screen.getByRole("button", { name: "Weekdays" }));
}

describe("QuickSetupCard", () => {
  it("starts empty: no name, times or days", () => {
    renderCard();
    expect(screen.getByRole("heading", { name: "Set your regular week" })).toBeInTheDocument();
    expect(screen.getByLabelText("Service name")).toHaveValue("");
    for (const day of [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]) {
      expect(screen.getByRole("checkbox", { name: day })).not.toBeChecked();
    }
    expect(screen.getByText("Add a service to see the times guests get.")).toBeInTheDocument();
  });

  it("fills a service from a name chip and the days from a shortcut, with the last-seating hint", () => {
    renderCard();
    bistroWeek();
    expect(screen.getByLabelText("Service name")).toHaveValue("Dinner");
    expect(screen.getByText(/Last seating 9:15 PM, 45 min before close/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Friday" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Saturday" })).not.toBeChecked();
    expect(
      screen.getByText(/Dinner: first seating 5:00 PM, last seating 9:15 PM/)
    ).toBeInTheDocument();
  });

  it("adds a service, focuses its name and announces it", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Add another service" }));
    expect(screen.getAllByLabelText("Service name")).toHaveLength(2);
    expect(screen.getAllByLabelText("Service name")[1]).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Service 2 added");
  });

  it("sends the draft once it is valid", async () => {
    const { onSave } = renderCard();
    bistroWeek();
    fireEvent.click(screen.getByRole("button", { name: "Save and open bookings" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ days: [1, 2, 3, 4, 5] });
  });

  it("sends nothing when invalid, names each problem and focuses the first", () => {
    const { onSave } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Save and open bookings" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Give this service a name.")).toBeInTheDocument();
    expect(screen.getAllByText("Choose a time.")).toHaveLength(3);
    expect(screen.getByText("Choose at least one day.")).toBeInTheDocument();
    expect(screen.getByLabelText("Service name")).toHaveFocus();
  });

  it("flags a last seating after close", () => {
    const { onSave } = renderCard();
    bistroWeek();
    // Dinner closes 10:00 PM; pick a later last seating.
    fireEvent.click(screen.getByLabelText("Last seating"));
    fireEvent.click(screen.getByRole("option", { name: "10:30 PM" }));
    fireEvent.click(screen.getByRole("button", { name: "Save and open bookings" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Last seating must be before closing.")).toBeInTheDocument();
  });

  it("shows a server error in an alert that takes focus, offering Retry", () => {
    renderCard({ errorMessage: "The reservations service hit a snag." });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The reservations service hit a snag.");
    expect(alert.parentElement).toHaveFocus();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("keeps the values after a failed save", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <main>
        <QuickSetupCard onSave={onSave} errorMessage={null} />
      </main>
    );
    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
    view.rerender(
      <main>
        <QuickSetupCard onSave={onSave} errorMessage="Nope" />
      </main>
    );
    expect(screen.getByLabelText("Service name")).toHaveValue("Dinner");
  });

  it("has no axe violations, empty or invalid", async () => {
    const { container } = render(
      <main>
        <QuickSetupCard onSave={vi.fn()} errorMessage="Couldn't reach the service." />
      </main>
    );
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});
