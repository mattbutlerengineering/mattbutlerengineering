import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
vi.mock("../../hooks/useTables.js", () => ({
  useTables: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));

import { EVERY_DAY, draftService } from "./quick-setup-demo.fixture.js";
import { type QuickSetupDraft } from "./quick-setup-draft.js";
import { validateDraft } from "./quick-setup-validate.js";
import { QuickSetupForm } from "./QuickSetupForm.js";

const LUNCH = "Lunch, 11:30 AM–3:00 PM · Every day";
const DINNER = "Dinner, 5:00 PM–10:00 PM · Every day";

function week(): QuickSetupDraft {
  return {
    days: EVERY_DAY,
    services: [
      draftService("lunch", "Lunch", ["11:30", "14:00", "15:00"]),
      draftService("dinner", "Dinner", ["17:00", "21:15", "22:00"]),
    ],
  };
}

/** Dinner without its last seating: a problem the Manager has not fixed. */
function weekWithProblem(): QuickSetupDraft {
  const base = week();
  return {
    ...base,
    services: [
      base.services[0]!,
      { ...base.services[1]!, lastSeating: null, lastSeatingLinked: false },
    ],
  };
}

/** The owner: live problems like Change regular week, or none like the schedule editor before a touch. */
function Harness(props: {
  readonly initial: QuickSetupDraft;
  readonly collapsible?: boolean;
  readonly live?: boolean;
}) {
  const [draft, setDraft] = useState(props.initial);
  return (
    <main>
      <QuickSetupForm
        draft={draft}
        onChange={setDraft}
        issues={props.live ? validateDraft(draft) : []}
        collapsible={props.collapsible}
        inDrawer
      />
      <button
        type="button"
        onClick={() =>
          setDraft((was) => ({
            ...was,
            services: was.services.map((s) =>
              s.id === "dinner" ? { ...s, lastSeating: "21:15" } : s
            ),
          }))
        }
      >
        Fix dinner
      </button>
    </main>
  );
}

const header = (name: string) => screen.getByRole("button", { name });

describe("QuickSetupForm collapsible lines", () => {
  it("shows every service as a closed line, with no fields mounted", () => {
    render(<Harness initial={week()} collapsible live />);
    expect(header(LUNCH).getAttribute("aria-expanded")).toBe("false");
    expect(header(DINNER).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryAllByLabelText("Service name")).toHaveLength(0);
    expect(screen.queryAllByLabelText("Opens")).toHaveLength(0);
  });

  it("names a line by its service, hours and days", () => {
    render(<Harness initial={week()} collapsible />);
    expect(header(LUNCH)).toBeTruthy();
    expect(header(LUNCH).getAttribute("aria-controls")).toBeTruthy();
  });

  it("opens one service and closes the other when a second is pressed", () => {
    render(<Harness initial={week()} collapsible />);
    fireEvent.click(header(LUNCH));
    expect(header(LUNCH).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByLabelText("Service name")).toHaveLength(1);
    const lunchFields = document.getElementById(header(LUNCH).getAttribute("aria-controls")!)!;
    expect(within(lunchFields).getByLabelText("Service name")).toBeTruthy();

    fireEvent.click(header(DINNER));
    expect(header(DINNER).getAttribute("aria-expanded")).toBe("true");
    expect(header(LUNCH).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getAllByLabelText("Service name")).toHaveLength(1);
  });

  it("closes an open service when its own line is pressed again", () => {
    render(<Harness initial={week()} collapsible />);
    fireEvent.click(header(LUNCH));
    fireEvent.click(header(LUNCH));
    expect(header(LUNCH).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryAllByLabelText("Service name")).toHaveLength(0);
  });

  it("holds a service with a problem open, says the problem on its line, and releases it once fixed", () => {
    render(<Harness initial={weekWithProblem()} collapsible live />);
    const dinner = screen.getByRole("button", { name: /^Dinner, 5:00 PM–10:00 PM · Every day/ });
    expect(dinner.getAttribute("aria-expanded")).toBe("true");
    expect(within(dinner).getByText("Choose a time.")).toBeTruthy();
    expect(dinner.querySelector("svg")).toBeNull();
    // Lunch has no problem and stays closed.
    expect(header(LUNCH).getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Fix dinner" }));
    expect(header(DINNER).getAttribute("aria-expanded")).toBe("false");
    expect(header(DINNER).querySelector("svg")).not.toBeNull();
    expect(screen.queryAllByLabelText("Service name")).toHaveLength(0);
  });

  it("keeps a forced-open service open while another is opened by hand", () => {
    render(<Harness initial={weekWithProblem()} collapsible live />);
    fireEvent.click(header(LUNCH));
    expect(header(LUNCH).getAttribute("aria-expanded")).toBe("true");
    expect(
      screen
        .getByRole("button", { name: /^Dinner, 5:00 PM–10:00 PM/ })
        .getAttribute("aria-expanded")
    ).toBe("true");
    expect(screen.getAllByLabelText("Service name")).toHaveLength(2);
  });

  it("opens an added service and focuses its name, closing the others", () => {
    render(<Harness initial={week()} collapsible />);
    fireEvent.click(header(LUNCH));
    fireEvent.click(screen.getByRole("button", { name: "Add another service" }));
    const names = screen.getAllByLabelText("Service name");
    expect(names).toHaveLength(1);
    expect(document.activeElement).toBe(names[0]);
    expect(header(LUNCH).getAttribute("aria-expanded")).toBe("false");
    expect(header("Service 3, Every day").getAttribute("aria-expanded")).toBe("true");
  });

  it("moves focus to the next service's line after a remove", () => {
    render(<Harness initial={week()} collapsible />);
    fireEvent.click(header(LUNCH));
    fireEvent.click(screen.getByRole("button", { name: "Remove service 1" }));
    expect(screen.queryAllByLabelText("Service name")).toHaveLength(0);
    expect(document.activeElement).toBe(header("Dinner, 5:00 PM–10:00 PM · Every day"));
  });

  it("moves focus to the previous service's line after removing the last", () => {
    render(<Harness initial={week()} collapsible />);
    fireEvent.click(header(DINNER));
    fireEvent.click(screen.getByRole("button", { name: "Remove service 2" }));
    expect(document.activeElement).toBe(header(LUNCH));
  });

  it("renders exactly as before when not collapsible: every service open, no lines", () => {
    render(<Harness initial={week()} />);
    expect(screen.getAllByLabelText("Service name")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: LUNCH })).toBeNull();
    // The only disclosures are each service's "More options" (E4.1): no line header.
    expect(
      [...document.querySelectorAll("button[aria-expanded]")].map((button) => button.textContent)
    ).toEqual(["More options", "More options"]);
  });
});

describe("QuickSetupForm lines under edit", () => {
  /** Dinner unnamed: a problem the Manager fixes by typing into the line itself. */
  function weekWithUnnamedDinner(): QuickSetupDraft {
    const base = week();
    return { ...base, services: [base.services[0]!, { ...base.services[1]!, name: "" }] };
  }

  it("keeps a line open and focused when its problem is fixed from inside it", () => {
    render(<Harness initial={weekWithUnnamedDinner()} collapsible live />);
    const name = screen.getByLabelText("Service name") as HTMLInputElement;
    name.focus();
    fireEvent.change(name, { target: { value: "Dinner" } });
    expect(screen.getByLabelText("Service name")).toBe(name);
    expect(document.activeElement).toBe(name);
    expect(header(DINNER).getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps a line open once its header was pressed, even after the problem is fixed elsewhere", () => {
    render(<Harness initial={weekWithProblem()} collapsible live />);
    fireEvent.click(screen.getByRole("button", { name: /^Dinner, 5:00 PM–10:00 PM/ }));
    fireEvent.click(screen.getByRole("button", { name: "Fix dinner" }));
    expect(header(DINNER).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByLabelText("Service name")).toHaveLength(1);
  });

  it("keeps rows mounted when the viewport crosses the phone width, and opens the focused one", () => {
    const { rerender } = render(<Harness initial={week()} />);
    const lunchName = screen.getAllByLabelText("Service name")[0] as HTMLInputElement;
    lunchName.focus();

    rerender(<Harness initial={week()} collapsible />);
    expect(screen.getAllByLabelText("Service name")).toHaveLength(1);
    expect(screen.getByLabelText("Service name")).toBe(lunchName);
    expect(header(LUNCH).getAttribute("aria-expanded")).toBe("true");
    expect(header(DINNER).getAttribute("aria-expanded")).toBe("false");

    rerender(<Harness initial={week()} />);
    expect(screen.getAllByLabelText("Service name")[0]).toBe(lunchName);
  });

  it("names a line from its visible text", () => {
    render(<Harness initial={week()} collapsible />);
    expect(header(LUNCH).textContent).toContain("Lunch");
    expect(header(LUNCH).hasAttribute("aria-label")).toBe(false);
    expect(header(LUNCH).querySelector("p")).toBeNull();
  });
});

describe("QuickSetupForm guest preview on a phone", () => {
  const PREVIEW = "Guest preview";
  const strip = () => screen.queryByRole("complementary", { name: PREVIEW });

  function Panelled(props: { readonly collapsible?: boolean }) {
    const [draft, setDraft] = useState(() => week());
    return (
      <main>
        <QuickSetupForm
          draft={draft}
          onChange={setDraft}
          issues={[]}
          collapsible={props.collapsible}
        />
      </main>
    );
  }

  it("is one closed row, with its hint, until opened", () => {
    render(<Panelled collapsible />);
    const row = screen.getByRole("button", { name: PREVIEW });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(row.getAttribute("aria-controls")).toBeTruthy();
    expect(within(row).getByText("First and last time a guest can book.")).toBeTruthy();
    expect(strip()).toBeNull();

    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(strip()).not.toBeNull();
    expect(document.getElementById(row.getAttribute("aria-controls")!)!.contains(strip())).toBe(
      true
    );

    fireEvent.click(row);
    expect(strip()).toBeNull();
  });

  it("is the strip as before when not collapsible", () => {
    render(<Panelled />);
    expect(strip()).not.toBeNull();
    expect(screen.getByRole("heading", { name: PREVIEW })).toBeTruthy();
    expect(screen.getByText("First and last time a guest can book.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: PREVIEW })).toBeNull();
  });
});
