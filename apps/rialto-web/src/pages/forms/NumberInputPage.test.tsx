import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NumberInputPage } from "./NumberInputPage";

function fieldControl(label: string): HTMLElement {
  const input = screen.getByLabelText(label);
  const control = input.parentElement;
  if (!control) throw new Error(`missing control for ${label}`);
  return control;
}

function step(label: string, direction: "Increase" | "Decrease") {
  const button = within(fieldControl(label)).getByRole("button", { name: direction });
  fireEvent.pointerDown(button);
  fireEvent.pointerUp(button);
}

describe("NumberInputPage pit strategy", () => {
  it("steps Target Lap and Fuel Load within their bounds", () => {
    render(<NumberInputPage />);

    const target = screen.getByLabelText("Target Lap");
    const fuel = screen.getByLabelText("Fuel Load (kg)");
    expect(target).toHaveValue("14");
    expect(fuel).toHaveValue("45");

    step("Target Lap", "Increase");
    expect(target).toHaveValue("15");
    fireEvent.keyDown(target, { key: "ArrowUp" });
    expect(target).toHaveValue("16");

    fireEvent.change(target, { target: { value: "78" } });
    fireEvent.blur(target);
    step("Target Lap", "Increase");
    expect(target).toHaveValue("78");

    fireEvent.change(target, { target: { value: "99" } });
    fireEvent.blur(target);
    expect(target).toHaveValue("78");

    fireEvent.keyDown(fuel, { key: "ArrowDown" });
    expect(fuel).toHaveValue("44.5");

    fireEvent.change(fuel, { target: { value: "0" } });
    fireEvent.blur(fuel);
    step("Fuel Load (kg)", "Decrease");
    expect(fuel).toHaveValue("0");
  });

  it("restores the pit strategy defaults on Reset", () => {
    render(<NumberInputPage />);

    step("Target Lap", "Increase");
    fireEvent.keyDown(screen.getByLabelText("Fuel Load (kg)"), { key: "ArrowDown" });
    expect(screen.getByLabelText("Target Lap")).toHaveValue("15");
    expect(screen.getByLabelText("Fuel Load (kg)")).toHaveValue("44.5");

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByLabelText("Target Lap")).toHaveValue("14");
    expect(screen.getByLabelText("Fuel Load (kg)")).toHaveValue("45");
  });

  it("still steps the interactive Lap Count demo", () => {
    render(<NumberInputPage />);

    step("Lap Count", "Increase");
    expect(screen.getByLabelText("Lap Count")).toHaveValue("6");
  });

  it("leaves the static Small example on 7", () => {
    render(<NumberInputPage />);

    step("Small", "Increase");
    expect(screen.getByLabelText("Small")).toHaveValue("7");
  });
});
