import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import { PinInputPage } from "./PinInputPage";

vi.mock("../components/PropsTable", () => ({
  PropsTable: () => null,
}));

function section(title: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: title });
  const root = heading.parentElement;
  if (!root) throw new Error(`missing section ${title}`);
  return root;
}

function cells(root: HTMLElement): HTMLInputElement[] {
  return [...root.querySelectorAll("input")];
}

function typeDigits(root: HTMLElement, digits: string) {
  const inputs = cells(root);
  for (let i = 0; i < digits.length; i++) {
    fireEvent.change(inputs[i]!, { target: { value: digits[i] } });
  }
}

describe("PinInputPage demos", () => {
  it("keeps digits typed into the length, type, and masked demos", () => {
    render(
      <ToastProvider>
        <PinInputPage />
      </ToastProvider>
    );

    const length = section("Length");
    const four = within(length).getByText("4-digit (default)").parentElement;
    const six = within(length).getByText("6-digit").parentElement;
    if (!four || !six) throw new Error("length demos not found");
    typeDigits(four, "12");
    expect(cells(four).map((input) => input.value)).toEqual(["1", "2", "", ""]);
    typeDigits(six, "12");
    expect(
      cells(six)
        .slice(0, 3)
        .map((input) => input.value)
    ).toEqual(["1", "2", ""]);

    const type = section("Type");
    const numeric = within(type).getByText("Digits only").parentElement;
    const alphanumeric = within(type).getByText("Letters or digits").parentElement;
    const masked = within(type).getByText("Hidden input").parentElement;
    if (!numeric || !alphanumeric || !masked) throw new Error("type demos not found");
    typeDigits(numeric, "12");
    typeDigits(alphanumeric, "A2");
    typeDigits(masked, "12");
    expect(
      cells(numeric)
        .slice(0, 2)
        .map((input) => input.value)
    ).toEqual(["1", "2"]);
    expect(
      cells(alphanumeric)
        .slice(0, 2)
        .map((input) => input.value)
    ).toEqual(["A", "2"]);
    expect(
      cells(masked)
        .slice(0, 2)
        .map((input) => input.value)
    ).toEqual(["1", "2"]);
    expect(cells(masked)[0]).toHaveAttribute("type", "password");
  });

  it("still fills the interactive verification demo", () => {
    render(
      <ToastProvider>
        <PinInputPage />
      </ToastProvider>
    );
    const interactive = section("Interactive");
    typeDigits(interactive, "12");
    expect(
      cells(interactive)
        .slice(0, 3)
        .map((input) => input.value)
    ).toEqual(["1", "2", ""]);
  });
});
