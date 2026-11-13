import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ScopeDialog } from "./ScopeDialog.js";

const labels = () =>
  within(screen.getByRole("dialog"))
    .getAllByRole("radio")
    .map((r) => r.closest("label")?.textContent);

describe("ScopeDialog (#8692)", () => {
  it("words only this date, this and following, and all dates once", () => {
    render(
      <ScopeDialog
        title="Edit"
        name="scope"
        dateLabel="Fri, Dec 4"
        onContinue={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(labels()).toEqual([
      "Only Fri, Dec 4",
      "This and following from Fri, Dec 4",
      "All dates",
    ]);
  });

  it("offers only the scopes it is given, opening on the first", () => {
    const onContinue = vi.fn();
    render(
      <ScopeDialog
        title="Edit"
        name="scope"
        dateLabel="Fri, Dec 4"
        offer={["all"]}
        onContinue={onContinue}
        onClose={vi.fn()}
      />
    );
    expect(labels()).toEqual(["All dates"]);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledWith("all");
  });

  it("hands back the scope picked", () => {
    const onContinue = vi.fn();
    render(
      <ScopeDialog
        title="Edit"
        name="scope"
        dateLabel="Fri, Dec 4"
        onContinue={onContinue}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("radio", { name: /^This and following/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledWith("following");
  });
});
