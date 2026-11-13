import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import { EditorSaveBar, type EditorSaveBarProps } from "./EditorSaveBar.js";
import { focusFirstInvalid, quickSetupFieldId } from "./quick-setup-field-helpers.js";
import type { QuickSetupIssue } from "./quick-setup-validate.js";

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };
const SCOPE = "save-bar-test";
const ISSUES: readonly QuickSetupIssue[] = [
  { serviceId: "dinner", field: "closes", code: "close_after_open" },
  { serviceId: "lunch", field: "opens", code: "time_required" },
];

function renderBar(overrides: Partial<EditorSaveBarProps> = {}) {
  const handlers = {
    onSave: vi.fn(),
    onDiscard: vi.fn(),
    onRefused: vi.fn(),
    focusFirstProblem: vi.fn(),
  };
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

const save = (name: string | RegExp = /^Save/) => screen.getByRole("button", { name });
const noViolations = async () =>
  expect((await axe(document.body, AXE_OPTIONS)).violations).toEqual([]);

describe("EditorSaveBar", () => {
  it("keeps Save disabled, and offers no Discard, until something changes", async () => {
    const { onSave } = renderBar({ dirty: false, reach: { kind: "dates", count: 212 } });
    expect(save()).toHaveProperty("disabled", true);
    fireEvent.click(save());
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
    expect(screen.getByTestId("editor-save-bar").hasAttribute("data-pinned")).toBe(false);
    await noViolations();
  });

  it("saves and discards once the draft is dirty, and pins the bar", async () => {
    const { onSave, onDiscard } = renderBar();
    expect(save("Save")).toHaveProperty("disabled", false);
    fireEvent.click(save("Save"));
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("editor-save-bar").hasAttribute("data-pinned")).toBe(true);
    await noViolations();
  });

  it.each([
    [1, "Save for 1 date"],
    [212, "Save for 212 dates"],
  ])("states the %i date(s) a save writes in its label", (count, label) => {
    renderBar({ reach: { kind: "dates", count } });
    expect(save(label)).toBeTruthy();
  });

  it("reads Save when the save has no date count", () => {
    renderBar({ reach: null });
    expect(save("Save")).toBeTruthy();
  });

  it("states the start date when the save applies from a later date", () => {
    renderBar({ reach: { kind: "from", date: "Dec 1" } });
    expect(save("Save from Dec 1")).toBeTruthy();
  });

  it("moves focus to the first problem, by the weekly form's own helper, and does not save", async () => {
    function Harness(props: { onSave: () => void }) {
      const [revealed, setRevealed] = useState(false);
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
          <EditorSaveBar
            dirty
            reach={{ kind: "dates", count: 3 }}
            hasProblem
            blockedReason="Fix the problem above to save."
            onSave={props.onSave}
            onDiscard={() => {}}
            onRefused={() => setRevealed(true)}
            focusFirstProblem={() => focusFirstInvalid(ISSUES, SCOPE)}
          />
        </main>
      );
    }
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    const button = save();
    // Pressable, so the press can say the problem: aria-disabled, never the disabled attribute.
    expect(button).toHaveProperty("disabled", false);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Dinner must close after it opens.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Dinner closes"));
    await noViolations();
  });

  it("moves focus again on each refused press, and not when the bar merely re-renders", () => {
    const { focusFirstProblem, onRefused, rerender, onSave, onDiscard } = renderBar({
      hasProblem: true,
    });
    expect(focusFirstProblem).not.toHaveBeenCalled();
    fireEvent.click(save());
    fireEvent.click(save());
    expect(onRefused).toHaveBeenCalledTimes(2);
    expect(focusFirstProblem).toHaveBeenCalledTimes(2);
    rerender(
      <main>
        <EditorSaveBar
          dirty
          reach={null}
          hasProblem
          blockedReason={null}
          onSave={onSave}
          onDiscard={onDiscard}
          focusFirstProblem={focusFirstProblem}
        />
      </main>
    );
    expect(focusFirstProblem).toHaveBeenCalledTimes(2);
  });

  it("says why Save is off as text tied to the button", async () => {
    const { onSave } = renderBar({ blockedReason: "Add a service to save." });
    const reason = screen.getByText("Add a service to save.");
    expect(save().getAttribute("aria-describedby")).toBe(reason.id);
    expect(reason.id).not.toBe("");
    expect(reason.hasAttribute("title")).toBe(false);
    // Blocked with nothing in the form to go to: the press has nowhere to take the Manager.
    expect(save()).toHaveProperty("disabled", true);
    fireEvent.click(save());
    expect(onSave).not.toHaveBeenCalled();
    await noViolations();
  });

  it("says no reason, and ties none to Save, when nothing blocks it", () => {
    renderBar();
    expect(save().hasAttribute("aria-describedby")).toBe(false);
  });

  it("offers Keep theirs or Replace them where the save reaches dates with special hours", async () => {
    const onChange = vi.fn();
    renderBar({
      reach: { kind: "dates", count: 212 },
      specialHours: { count: 3, value: "keep", onChange },
    });
    const group = screen.getByRole("radiogroup", { name: "3 dates already have special hours" });
    expect(group).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Keep theirs" }).getAttribute("aria-checked")).toBe(
      "true"
    );
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

  it("offers no choice when no date has special hours, or nothing has changed", () => {
    const onChange = vi.fn();
    const { unmount } = renderBar({ specialHours: { count: 0, value: "keep", onChange } });
    expect(screen.queryByRole("radiogroup")).toBeNull();
    unmount();
    renderBar({ dirty: false, specialHours: { count: 3, value: "keep", onChange } });
    expect(screen.queryByRole("radiogroup")).toBeNull();
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
