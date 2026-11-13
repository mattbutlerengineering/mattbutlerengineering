import { StrictMode, useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { EditorSaveBar, type EditorSaveBarProps } from "./EditorSaveBar.js";
import { focusFirstInvalid, quickSetupFieldId } from "./quick-setup-field-helpers.js";
import type { QuickSetupIssue } from "./quick-setup-validate.js";
import { useRefusedPress } from "./use-refused-press.js";

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };
const SCOPE = "save-bar-test";
const ISSUES: readonly QuickSetupIssue[] = [
  { serviceId: "dinner", field: "closes", code: "close_after_open" },
  { serviceId: "lunch", field: "opens", code: "time_required" },
];
const FIX_PROBLEMS = "Fix the problems above to save.";

function renderBar(overrides: Partial<EditorSaveBarProps> = {}) {
  const handlers = { onSave: vi.fn(), onDiscard: vi.fn(), onRefused: vi.fn() };
  const utils = render(
    <main>
      <EditorSaveBar
        dirty
        reach={null}
        hasProblem={false}
        blockedReason={null}
        {...handlers}
        {...overrides}
      />
    </main>
  );
  return { ...utils, ...handlers };
}

/** An editor page in small: it owns the refusal, and can refuse from outside the bar. */
function Editor(props: { onSave: () => void; focusSpy?: () => void; onReveal?: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const refusal = useRefusedPress({
    onRefused: () => {
      props.onReveal?.();
      setRevealed(true);
    },
    focusFirstProblem: () => {
      props.focusSpy?.();
      focusFirstInvalid(ISSUES, SCOPE);
    },
  });
  const [, setTick] = useState(0);
  return (
    <main>
      <label>
        Lunch opens
        <input id={quickSetupFieldId("lunch", "opens", undefined, SCOPE)} />
      </label>
      <label>
        Dinner closes
        <input id={quickSetupFieldId("dinner", "closes", undefined, SCOPE)} />
      </label>
      {revealed && <p>Dinner must close after it opens.</p>}
      <button type="button" onClick={refusal.refuse}>
        Leave prompt: Save
      </button>
      <button type="button" onClick={() => setTick((n) => n + 1)}>
        Render again
      </button>
      <EditorSaveBar
        dirty
        reach={{ kind: "dates", count: 3 }}
        hasProblem
        blockedReason={null}
        onSave={props.onSave}
        onDiscard={() => {}}
        onRefused={refusal.refuse}
      />
    </main>
  );
}

const save = (name: string | RegExp = /^Save/) => screen.getByRole("button", { name });
const noViolations = async () =>
  expect((await axe(document.body, AXE_OPTIONS)).violations).toEqual([]);

describe("EditorSaveBar", () => {
  it("keeps Save disabled, and offers no Discard, until something changes", async () => {
    const { onSave } = renderBar({ dirty: false, reach: { kind: "dates", count: 212 } });
    expect(save()).toBeDisabled();
    fireEvent.click(save());
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
    expect(screen.getByTestId("editor-save-bar")).not.toHaveAttribute("data-pinned");
    await noViolations();
  });

  it("saves and discards once the draft is dirty, and pins the bar", async () => {
    const { onSave, onDiscard } = renderBar();
    expect(save("Save")).toBeEnabled();
    expect(save("Save")).not.toHaveAttribute("aria-disabled");
    fireEvent.click(save("Save"));
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("editor-save-bar")).toHaveAttribute("data-pinned");
    await noViolations();
  });

  describe("the Save label", () => {
    it.each([
      [1, "Save for 1 date"],
      [212, "Save for 212 dates"],
      [1234, "Save for 1,234 dates"],
    ])("states the %i date(s) a save writes", (count, label) => {
      renderBar({ reach: { kind: "dates", count } });
      expect(save(label)).toBeTruthy();
    });

    it("reads Save when the save has no date count", () => {
      renderBar({ reach: null });
      expect(save("Save")).toBeTruthy();
    });

    it.each([0, -1, 1.5, Number.NaN])("reads Save for a count of %s", (count) => {
      renderBar({ reach: { kind: "dates", count } });
      expect(save("Save")).toBeTruthy();
    });

    it("states the start date when the save applies from a later date", () => {
      renderBar({ reach: { kind: "from", date: "Dec 1" } });
      expect(save("Save from Dec 1")).toBeTruthy();
    });
  });

  describe("a press with a problem", () => {
    it("moves focus to the first problem, by the weekly form's own helper, and does not save", async () => {
      const onSave = vi.fn();
      render(<Editor onSave={onSave} />);
      const button = save();
      // Pressable, so the press can say the problem: aria-disabled, never the disabled attribute.
      expect(button).toBeEnabled();
      expect(button).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(button);
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByText("Dinner must close after it opens.")).toBeTruthy();
      expect(screen.getByLabelText("Dinner closes")).toHaveFocus();
      await noViolations();
    });

    it("says there are problems to fix, tied to Save, when the editor gives no reason", () => {
      renderBar({ hasProblem: true });
      expect(save()).toHaveAccessibleDescription(FIX_PROBLEMS);
      expect(screen.getByRole("status")).toHaveTextContent(FIX_PROBLEMS);
    });

    it("says the editor's reason in place of its own", () => {
      renderBar({ hasProblem: true, blockedReason: "Dinner must close after it opens." });
      expect(save()).toHaveAccessibleDescription("Dinner must close after it opens.");
      expect(screen.queryByText(FIX_PROBLEMS)).toBeNull();
    });

    it("tells the editor of each refused press, and does not save", () => {
      const { onRefused, onSave } = renderBar({ hasProblem: true });
      fireEvent.click(save());
      fireEvent.click(save());
      expect(onRefused).toHaveBeenCalledTimes(2);
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  describe("useRefusedPress", () => {
    it("reveals and focuses once for a refusal from outside the bar", () => {
      const focusSpy = vi.fn();
      const onReveal = vi.fn();
      render(<Editor onSave={vi.fn()} focusSpy={focusSpy} onReveal={onReveal} />);
      // Nothing on mount.
      expect(focusSpy).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Leave prompt: Save" }));
      expect(onReveal).toHaveBeenCalledTimes(1);
      expect(focusSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText("Dinner closes")).toHaveFocus();
    });

    it("focuses once per refusal, from the bar or outside it, and never on a plain re-render", () => {
      const focusSpy = vi.fn();
      render(<Editor onSave={vi.fn()} focusSpy={focusSpy} />);
      fireEvent.click(save());
      expect(focusSpy).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "Render again" }));
      fireEvent.click(screen.getByRole("button", { name: "Render again" }));
      expect(focusSpy).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "Leave prompt: Save" }));
      expect(focusSpy).toHaveBeenCalledTimes(2);
    });

    it("focuses once per refusal under StrictMode, and not on mount", () => {
      const focusSpy = vi.fn();
      const onReveal = vi.fn();
      render(
        <StrictMode>
          <Editor onSave={vi.fn()} focusSpy={focusSpy} onReveal={onReveal} />
        </StrictMode>
      );
      expect(focusSpy).not.toHaveBeenCalled();
      fireEvent.click(save());
      expect(onReveal).toHaveBeenCalledTimes(1);
      expect(focusSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("a blocked Save", () => {
    it("says why as a status, tied to a Save that Tab still reaches", async () => {
      const user = userEvent.setup();
      renderBar({ blockedReason: "Add a service to save." });
      const reason = screen.getByRole("status");
      expect(reason).toHaveTextContent("Add a service to save.");
      expect(reason).not.toHaveAttribute("title");
      expect(save()).toHaveAccessibleDescription("Add a service to save.");
      expect(save()).toBeEnabled();
      expect(save()).toHaveAttribute("aria-disabled", "true");
      await user.tab();
      expect(screen.getByRole("button", { name: "Discard" })).toHaveFocus();
      await user.tab();
      expect(save()).toHaveFocus();
      await noViolations();
    });

    it("does nothing on a press but keep focus on Save", async () => {
      const user = userEvent.setup();
      const { onSave, onRefused } = renderBar({ blockedReason: "Add a service to save." });
      await user.click(save());
      expect(onSave).not.toHaveBeenCalled();
      expect(onRefused).not.toHaveBeenCalled();
      expect(save()).toHaveFocus();
    });

    it("keeps an empty status, and ties nothing to Save, when nothing blocks it", () => {
      renderBar();
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      expect(save()).not.toHaveAttribute("aria-describedby");
    });

    it("says no reason while nothing has changed", () => {
      renderBar({ dirty: false, hasProblem: true, blockedReason: "Add a service to save." });
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      expect(save()).not.toHaveAttribute("aria-describedby");
    });
  });

  describe("Keep theirs or Replace them", () => {
    it("is offered where the save reaches dates with special hours", async () => {
      const onChange = vi.fn();
      renderBar({
        reach: { kind: "dates", count: 212 },
        specialHours: { count: 3, value: "keep", onChange },
      });
      expect(
        screen.getByRole("radiogroup", { name: "3 dates already have special hours" })
      ).toBeTruthy();
      expect(screen.getByRole("radio", { name: "Keep theirs" })).toBeChecked();
      fireEvent.click(screen.getByRole("radio", { name: "Replace them" }));
      expect(onChange).toHaveBeenCalledWith("replace");
      await noViolations();
    });

    it("calls back with keep from Replace them", () => {
      const onChange = vi.fn();
      renderBar({ specialHours: { count: 1, value: "replace", onChange } });
      expect(
        screen.getByRole("radiogroup", { name: "1 date already has special hours" })
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("radio", { name: "Keep theirs" }));
      expect(onChange).toHaveBeenCalledWith("keep");
    });

    it("formats a large count for the locale", () => {
      renderBar({ specialHours: { count: 1234, value: "keep", onChange: vi.fn() } });
      expect(
        screen.getByRole("radiogroup", { name: "1,234 dates already have special hours" })
      ).toBeTruthy();
    });

    it.each([0, -1, 1.5, Number.NaN])("is not offered for a count of %s", (count) => {
      renderBar({ specialHours: { count, value: "keep", onChange: vi.fn() } });
      expect(screen.queryByRole("radiogroup")).toBeNull();
    });

    it("is not offered while nothing has changed", () => {
      renderBar({ dirty: false, specialHours: { count: 3, value: "keep", onChange: vi.fn() } });
      expect(screen.queryByRole("radiogroup")).toBeNull();
    });
  });

  it("renders the editor's own choice inside the pinned bar, above the buttons", () => {
    renderBar({ children: <p>Summer hours overlaps Patio season</p> });
    const bar = screen.getByTestId("editor-save-bar");
    const slot = screen.getByText("Summer hours overlaps Patio season");
    expect(bar).toHaveAttribute("data-pinned");
    expect(bar).toContainElement(slot);
    const before = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(slot.compareDocumentPosition(screen.getByRole("button", { name: "Discard" }))).toBe(
      before
    );
    expect(slot.compareDocumentPosition(save())).toBe(before);
  });

  it("holds both buttons while a save is in flight", async () => {
    const { onSave, onDiscard } = renderBar({ saving: true });
    fireEvent.click(save());
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    await noViolations();
  });
});
