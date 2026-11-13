import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import { DiscardChangesDialog } from "./DiscardChangesDialog.js";

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

function renderDialog(open = true) {
  const handlers = { onDiscard: vi.fn(), onKeepEditing: vi.fn() };
  const utils = render(
    <main>
      <DiscardChangesDialog open={open} date="2026-10-30" {...handlers} />
    </main>
  );
  return { ...utils, ...handlers };
}

describe("DiscardChangesDialog", () => {
  it("names the date and offers Discard or Keep editing", () => {
    const { onDiscard, onKeepEditing } = renderDialog();
    expect(
      screen.getByRole("alertdialog", { name: /Discard changes to Friday, October 30\?/ })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(onKeepEditing).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).toHaveBeenCalled();
  });

  it("offers Save beside Discard and Keep editing when the draft can be saved from here", () => {
    const onSave = vi.fn();
    const handlers = { onDiscard: vi.fn(), onKeepEditing: vi.fn() };
    render(
      <main>
        <DiscardChangesDialog open date={null} title="Leave?" onSave={onSave} {...handlers} />
      </main>
    );
    expect(screen.getByRole("alertdialog", { name: "Leave?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(handlers.onDiscard).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(handlers.onKeepEditing).toHaveBeenCalledTimes(1);
  });

  it("offers no Save unless asked", () => {
    renderDialog();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("renders nothing while closed", () => {
    renderDialog(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("has no axe violations", async () => {
    renderDialog();
    expect((await axe(document.body, AXE_OPTIONS)).violations).toEqual([]);
  });
});
