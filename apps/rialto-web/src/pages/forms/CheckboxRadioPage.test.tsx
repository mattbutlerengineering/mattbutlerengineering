import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckboxRadioPage } from "./CheckboxRadioPage";

function group(name: string) {
  return screen.getByRole("radiogroup", { name });
}

function radio(groupName: string, name: string | RegExp) {
  return within(group(groupName)).getByRole("radio", { name });
}

describe("CheckboxRadioPage radio groups", () => {
  it("selects a tyre compound when its label is clicked", async () => {
    const user = userEvent.setup();
    render(<CheckboxRadioPage />);

    expect(radio("Tyre Compound", "Medium (C3)")).toBeChecked();

    await user.click(screen.getByText("Soft (C5)"));
    expect(radio("Tyre Compound", "Soft (C5)")).toBeChecked();
    expect(radio("Tyre Compound", "Medium (C3)")).not.toBeChecked();

    await user.click(screen.getByText("Hard (C1)"));
    expect(radio("Tyre Compound", "Hard (C1)")).toBeChecked();
    expect(radio("Tyre Compound", "Soft (C5)")).not.toBeChecked();
  });

  it("moves the tyre compound with arrow keys and wraps at the ends", async () => {
    const user = userEvent.setup();
    render(<CheckboxRadioPage />);

    radio("Tyre Compound", "Medium (C3)").focus();
    await user.keyboard("{ArrowDown}");
    expect(radio("Tyre Compound", "Hard (C1)")).toBeChecked();

    await user.keyboard("{ArrowRight}");
    expect(radio("Tyre Compound", "Intermediate")).toBeChecked();

    await user.keyboard("{ArrowUp}");
    expect(radio("Tyre Compound", "Hard (C1)")).toBeChecked();

    radio("Tyre Compound", "Soft (C5)").focus();
    await user.keyboard("{ArrowUp}");
    expect(radio("Tyre Compound", "Full Wet")).toBeChecked();

    await user.keyboard("{ArrowDown}");
    expect(radio("Tyre Compound", "Soft (C5)")).toBeChecked();
  });

  it("keeps Driving Mode updating and leaves the disabled Wet radio unselected", async () => {
    const user = userEvent.setup();
    render(<CheckboxRadioPage />);

    expect(radio("Driving Mode", /^Sport/)).toBeChecked();
    expect(radio("Driving Mode", "Wet")).toBeDisabled();

    await user.click(screen.getByText("Comfort"));
    expect(radio("Driving Mode", "Comfort")).toBeChecked();

    radio("Driving Mode", "Race").focus();
    await user.keyboard("{ArrowDown}");
    expect(radio("Driving Mode", "Comfort")).toBeChecked();
    expect(radio("Driving Mode", "Wet")).not.toBeChecked();
  });
});
