import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import type * as Rialto from "@mattbutlerengineering/rialto";

vi.mock("@mattbutlerengineering/rialto", async (importOriginal) => ({
  ...(await importOriginal<typeof Rialto>()),
  // The calendar popover is not what these tests are about: a plain input stands in for it.
  DatePicker: (props: { label: string; value: string | null; onChange: (v: string) => void }) => (
    <input
      aria-label={props.label}
      value={props.value ?? ""}
      onChange={(e) => props.onChange(e.target.value)}
    />
  ),
}));

import { GoToDateDialog } from "./GoToDateDialog.js";

function renderDialog(open = true) {
  const onGo = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <main>
      <GoToDateDialog open={open} initial="2026-11-02" onGo={onGo} onClose={onClose} />
    </main>
  );
  return { ...utils, onGo, onClose };
}

describe("GoToDateDialog (ux.md S2 Go to date)", () => {
  it("is closed until asked", () => {
    renderDialog(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("goes to the date typed, as the venue calendar date, and closes", () => {
    const { onGo, onClose } = renderDialog();
    expect(screen.getByRole("dialog", { name: "Go to date" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2027-01-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onGo).toHaveBeenCalledWith("2027-01-15");
    expect(onClose).toHaveBeenCalled();
  });

  it("cannot go before a date is chosen", () => {
    const { onGo } = renderDialog();
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "" } });
    const go = screen.getByRole("button", { name: "Go" });
    expect(go).toBeDisabled();
    fireEvent.click(go);
    expect(onGo).not.toHaveBeenCalled();
  });

  it("has no axe violations", async () => {
    renderDialog();
    const results = await axe(document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
