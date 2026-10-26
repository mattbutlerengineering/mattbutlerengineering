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
      screen.getByRole("dialog", { name: /Discard changes to Friday, October 30\?/ })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(onKeepEditing).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).toHaveBeenCalled();
  });

  it("renders nothing while closed", () => {
    renderDialog(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("has no axe violations", async () => {
    renderDialog();
    expect((await axe(document.body, AXE_OPTIONS)).violations).toEqual([]);
  });
});
