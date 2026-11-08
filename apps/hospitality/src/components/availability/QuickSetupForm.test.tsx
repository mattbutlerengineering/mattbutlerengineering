import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { axe } from "vitest-axe";
vi.mock("../../hooks/useTables.js", () => ({
  useTables: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));

import { QuickSetupCard } from "./QuickSetupCard.js";
import { draftService } from "./quick-setup-demo.fixture.js";
import { draftToConfig, validateDraft, type QuickSetupDraft } from "./quick-setup-draft.js";
import { QuickSetupForm } from "./QuickSetupForm.js";

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

/** Everything the polite regions on the card say: the form's own and the strip's. */
const announced = () =>
  screen
    .getAllByRole("status")
    .map((region) => region.textContent)
    .join(" ");

describe("QuickSetupForm per-service days", () => {
  it("keeps every disclosure closed, so no control is duplicated", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Add another service" }));
    expect(screen.getAllByRole("button", { name: DIFFERENT_DAYS })).toHaveLength(2);
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

    // Lunch's opener gave way to "Use the shared days", so Brunch's is the one left.
    fireEvent.click(screen.getByRole("button", { name: DIFFERENT_DAYS }));
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

  it("offers one control at a time, moving focus into the days and back to the opener", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
    fireEvent.click(screen.getByRole("button", { name: "Weekdays" }));
    fireEvent.click(screen.getByRole("button", { name: DIFFERENT_DAYS }));
    const group = screen.getByRole("group", { name: "Dinner runs on" });
    expect(within(group).getAllByRole("checkbox")[0]).toHaveFocus();
    // Open, only "Use the shared days" closes it: no second button doing the same.
    expect(screen.queryByRole("button", { name: DIFFERENT_DAYS })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Use the shared days" }));
    expect(screen.getByRole("button", { name: DIFFERENT_DAYS })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Use the shared days" })).not.toBeInTheDocument();
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

describe("QuickSetupForm removing a service", () => {
  it("moves focus to the previous service's name instead of dropping it to the page", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Add another service" }));
    const names = screen.getAllByLabelText("Service name");
    expect(names[1]).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Remove service 2" }));
    expect(screen.getAllByLabelText("Service name")).toHaveLength(1);
    expect(screen.getByLabelText("Service name")).toHaveFocus();
  });
});

const DIFFERENT_HOURS = "Different hours on some days";

function chooseTime(scope: HTMLElement, label: string, option: string) {
  fireEvent.click(within(scope).getByLabelText(label));
  fireEvent.click(screen.getByRole("option", { name: option }));
}

describe("QuickSetupForm different hours on some days", () => {
  function bistroWithLateBlock() {
    const view = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
    fireEvent.click(screen.getByRole("button", { name: "Every day" }));
    fireEvent.click(screen.getByRole("button", { name: DIFFERENT_HOURS }));
    return view;
  }

  it("keeps blocks out of the DOM until one is added, then announces it", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
    expect(
      screen.queryByRole("group", { name: "Dinner: different hours" })
    ).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Opens")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Every day" }));
    fireEvent.click(screen.getByRole("button", { name: DIFFERENT_HOURS }));
    const block = screen.getByRole("group", { name: "Dinner: different hours" });
    // Starts with no day ticked and Dinner's own hours; focus goes to the first day.
    expect(
      within(block)
        .getAllByRole("checkbox")
        .filter((c) => (c as HTMLInputElement).checked)
    ).toHaveLength(0);
    expect(within(block).getAllByRole("checkbox")).toHaveLength(7);
    expect(within(block).getAllByRole("checkbox")[0]).toHaveFocus();
    expect(announced()).toContain("Different hours added");
  });

  it("does not mark the add button expanded: a click adds another block, it never collapses", () => {
    bistroWithLateBlock();
    expect(screen.getByRole("button", { name: DIFFERENT_HOURS })).not.toHaveAttribute(
      "aria-expanded"
    );
  });

  it("changes the live region's DOM when the same announcement repeats", () => {
    bistroWithLateBlock();
    const region = () => screen.getAllByRole("status")[0]!;
    const first = region().textContent;
    expect(first).toContain("Different hours added");
    fireEvent.click(screen.getByRole("button", { name: DIFFERENT_HOURS }));
    expect(region().textContent).toContain("Different hours added");
    expect(region().textContent).not.toBe(first);
  });

  it("puts a later close on Friday and Saturday into one set of the draft", async () => {
    const { onSave } = bistroWithLateBlock();
    const block = screen.getByRole("group", { name: "Dinner: different hours" });
    fireEvent.click(within(block).getByRole("checkbox", { name: "Fri" }));
    fireEvent.click(within(block).getByRole("checkbox", { name: "Sat" }));
    chooseTime(block, "Closes", "12:00 AM");
    expect(within(block).getByText("Closes 12:00 AM the next day")).toBeInTheDocument();
    // Last seating stayed linked to the close until edited: 45 minutes before 12:00 AM.

    fireEvent.click(screen.getByRole("button", { name: "Save and open bookings" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0]![0];
    expect(saved.services[0]?.blocks).toMatchObject([
      { days: [5, 6], closes: "00:00", lastSeating: "23:15" },
    ]);
    const [row] = draftToConfig(saved, () => "id").scheduleServices;
    expect(row?.dayHours.sets).toHaveLength(1);
    expect(row?.dayHours.sets[0]).toMatchObject({ weekdays: [5, 6], closesAt: 1440 });
  });

  it("removes a block, announces it and returns focus to the button that added it", () => {
    bistroWithLateBlock();
    const block = screen.getByRole("group", { name: "Dinner: different hours" });
    fireEvent.click(within(block).getByRole("checkbox", { name: "Fri" }));
    fireEvent.click(within(block).getByRole("button", { name: "Remove these hours" }));
    expect(
      screen.queryByRole("group", { name: "Dinner: different hours" })
    ).not.toBeInTheDocument();
    expect(announced()).toContain("Hours for Fri removed");
    expect(screen.getByRole("button", { name: DIFFERENT_HOURS })).toHaveFocus();
  });

  it("moves a day out of the other block and drops the block it empties", () => {
    bistroWithLateBlock();
    fireEvent.click(screen.getByRole("button", { name: DIFFERENT_HOURS }));
    const [first, second] = screen.getAllByRole("group", { name: "Dinner: different hours" });
    fireEvent.click(within(first!).getByRole("checkbox", { name: "Fri" }));
    fireEvent.click(within(second!).getByRole("checkbox", { name: "Fri" }));
    expect(announced()).toContain("Friday moved from the other hours");
    expect(announced()).toContain("Hours for Fri removed");
    expect(screen.getAllByRole("group", { name: "Dinner: different hours" })).toHaveLength(1);
  });

  it("only offers the days the service runs on", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
    fireEvent.click(screen.getByRole("button", { name: "Weekdays" }));
    fireEvent.click(screen.getByRole("button", { name: DIFFERENT_HOURS }));
    const block = screen.getByRole("group", { name: "Dinner: different hours" });
    expect(
      within(block)
        .getAllByRole("checkbox")
        .map((c) => c.getAttribute("id") && (c.closest("label")?.textContent ?? ""))
    ).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  });

  it("refuses to save a block with no day and focuses it", () => {
    const { onSave } = bistroWithLateBlock();
    fireEvent.click(screen.getByRole("button", { name: "Save and open bookings" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Choose at least one day for these hours.")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Dinner: different hours" })).toHaveFocus();
  });

  it("has no axe violations with the days and a block open", async () => {
    const { container } = render(
      <main>
        <QuickSetupCard onSave={vi.fn()} errorMessage={null} />
      </main>
    );
    fireEvent.click(screen.getByRole("button", { name: "Dinner" }));
    fireEvent.click(screen.getByRole("button", { name: "Every day" }));
    fireEvent.click(screen.getByRole("button", { name: DIFFERENT_DAYS }));
    fireEvent.click(screen.getByRole("button", { name: DIFFERENT_HOURS }));
    fireEvent.click(screen.getByRole("button", { name: "Save and open bookings" }));
    // jsdom cannot compute colour contrast; token contrast is covered in rialto.
    const options = { rules: { "color-contrast": { enabled: false } } };
    expect((await axe(container, options)).violations).toEqual([]);
  });
});

const checkedDays = (scope: HTMLElement) =>
  within(scope)
    .getAllByRole("checkbox")
    .filter((c) => (c as HTMLInputElement).checked)
    .map((c) => c.closest("label")?.textContent);

function DrawerForm({
  initial,
  fixedDays = false,
}: {
  initial: QuickSetupDraft;
  fixedDays?: boolean;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <QuickSetupForm
      draft={draft}
      onChange={setDraft}
      issues={validateDraft(draft)}
      inDrawer
      fixedDays={fixedDays}
    />
  );
}

describe("QuickSetupForm days control", () => {
  const dinnerEveryDay = (): QuickSetupDraft => ({
    services: [draftService("s1", "Dinner", ["17:00", "21:15", "22:00"])],
    days: [1, 2, 3, 4, 5, 6, 0],
  });

  it("keeps all seven days visible in a drawer while days are ticked, with no Change days", () => {
    render(<DrawerForm initial={dinnerEveryDay()} />);
    expect(screen.queryByRole("button", { name: "Change days" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);
    fireEvent.click(screen.getByRole("checkbox", { name: "Monday" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Tuesday" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);
    expect(screen.queryByRole("button", { name: "Change days" })).not.toBeInTheDocument();
  });

  it("sets exactly Friday and Saturday from Fri–Sat in the shared days", () => {
    render(<DrawerForm initial={dinnerEveryDay()} />);
    fireEvent.click(screen.getByRole("button", { name: "Fri–Sat" }));
    expect(checkedDays(screen.getByRole("group", { name: "Days" }))).toEqual([
      "Friday",
      "Saturday",
    ]);
  });

  it("sets exactly Friday and Saturday from Fri–Sat in a service's own days", () => {
    render(<DrawerForm initial={dinnerEveryDay()} />);
    fireEvent.click(screen.getByRole("button", { name: DIFFERENT_DAYS }));
    const own = screen.getByRole("group", { name: "Dinner runs on" });
    fireEvent.click(within(own).getByRole("button", { name: "Fri–Sat" }));
    expect(checkedDays(own)).toEqual(["Friday", "Saturday"]);
  });

  it("sets exactly Friday and Saturday from Fri–Sat in a block", () => {
    render(<DrawerForm initial={dinnerEveryDay()} />);
    fireEvent.click(screen.getByRole("button", { name: DIFFERENT_HOURS }));
    const block = screen.getByRole("group", { name: "Dinner: different hours" });
    fireEvent.click(within(block).getByRole("button", { name: "Fri–Sat" }));
    expect(checkedDays(block)).toEqual(["Fri", "Sat"]);
  });

  it("still asks for at least one day", () => {
    render(<DrawerForm initial={dinnerEveryDay()} />);
    for (const day of [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]) {
      fireEvent.click(screen.getByRole("checkbox", { name: day }));
    }
    expect(screen.getByText("Choose at least one day.")).toBeInTheDocument();
  });

  it("shows fixed days as text, not controls", () => {
    render(<DrawerForm initial={dinnerEveryDay()} fixedDays />);
    expect(screen.getByText(/^Days: /)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Monday" })).not.toBeInTheDocument();
  });
});

describe("QuickSetupForm overlap fix", () => {
  it("offers the first clear start for a typed overlap and applying it clears the issue", () => {
    render(
      <DrawerForm
        initial={{
          days: [1, 2, 3, 4, 5],
          services: [
            draftService("s1", "Lunch", ["11:30", "17:15", "18:00"]),
            draftService("s2", "Dinner", ["17:00", "21:15", "22:00"]),
          ],
        }}
      />
    );
    expect(screen.getAllByText(/overlaps/).length).toBeGreaterThan(0);
    const fix = screen.getByRole("button", { name: "Move Dinner to 6:00 PM" });
    fireEvent.click(fix);
    expect(screen.queryByText(/overlaps/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Move / })).not.toBeInTheDocument();
  });

  it("offers no action when no later start clears the overlap", () => {
    render(
      <DrawerForm
        initial={{
          days: [1, 2, 3, 4, 5],
          services: [
            draftService("s1", "Lunch", ["00:00", "22:45", "23:59"]),
            draftService("s2", "Dinner", ["17:00", "21:15", "22:00"]),
          ],
        }}
      />
    );
    expect(screen.getAllByText(/overlaps/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^Move / })).not.toBeInTheDocument();
  });
});
