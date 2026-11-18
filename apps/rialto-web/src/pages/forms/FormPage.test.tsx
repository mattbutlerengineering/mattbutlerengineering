import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormPage } from "./FormPage";

vi.mock("../components/PropsTable", () => ({
  PropsTable: () => null,
}));

beforeAll(() => {
  // jsdom does not implement scrollIntoView; Select calls it when the list opens.
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

function setSeats(count: number) {
  const input = screen.getByLabelText("Seats");
  const control = input.parentElement;
  if (!control) throw new Error("missing seats control");
  const increase = within(control).getByRole("button", { name: "Increase" });
  for (let i = 0; i < count; i++) {
    fireEvent.pointerDown(increase);
    fireEvent.pointerUp(increase);
  }
}

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Submit" }));
}

function summary(): HTMLElement {
  return screen.getByRole("alert");
}

describe("FormPage registration demo required fields", () => {
  it("reports empty email, bio, and team, and leaves a chosen seat count valid", async () => {
    const user = userEvent.setup();
    render(<FormPage />);

    setSeats(2);
    expect(screen.getByLabelText("Seats")).toHaveValue("2");
    await submit(user);

    const alert = summary();
    expect(alert).toHaveTextContent("3 fields need attention");
    expect(alert).toHaveTextContent("Email is required");
    expect(alert).toHaveTextContent("Bio is required");
    expect(alert).toHaveTextContent("Team is required");
    expect(alert).not.toHaveTextContent("Pick at least 1 seat");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Bio")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("Submitted!")).not.toBeInTheDocument();
  });

  it("still reports every empty field, including seats, when the form is untouched", async () => {
    const user = userEvent.setup();
    render(<FormPage />);

    await submit(user);

    const alert = summary();
    expect(alert).toHaveTextContent("4 fields need attention");
    expect(alert).toHaveTextContent("Email is required");
    expect(alert).toHaveTextContent("Bio is required");
    expect(alert).toHaveTextContent("Pick at least 1 seat");
    expect(alert).toHaveTextContent("Team is required");
    expect(screen.queryByText("Submitted!")).not.toBeInTheDocument();
  });

  it("treats whitespace-only email and bio as required and keeps the typed spaces", async () => {
    const user = userEvent.setup();
    render(<FormPage />);
    const email = screen.getByLabelText("Email");
    const bio = screen.getByLabelText("Bio");

    await user.type(email, "   ");
    await user.type(bio, "   ");
    setSeats(2);
    await submit(user);

    expect(email).toHaveValue("   ");
    expect(bio).toHaveValue("   ");
    const alert = summary();
    expect(alert).toHaveTextContent("3 fields need attention");
    expect(alert).toHaveTextContent("Email is required");
    expect(alert).toHaveTextContent("Bio is required");
    expect(alert).toHaveTextContent("Team is required");
    expect(alert).not.toHaveTextContent("Pick at least 1 seat");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(bio).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("Submitted!")).not.toBeInTheDocument();
  });

  it("treats tab and newline-only values as empty without rewriting them", async () => {
    const user = userEvent.setup();
    render(<FormPage />);
    const email = screen.getByLabelText("Email");
    const bio = screen.getByLabelText("Bio");

    fireEvent.change(email, { target: { value: "\t\t" } });
    fireEvent.change(bio, { target: { value: "\n  \n" } });
    setSeats(2);
    await submit(user);

    expect(email).toHaveValue("\t\t");
    expect(bio).toHaveValue("\n  \n");
    const alert = summary();
    expect(alert).toHaveTextContent("3 fields need attention");
    expect(alert).toHaveTextContent("Email is required");
    expect(alert).toHaveTextContent("Bio is required");
    expect(screen.queryByText("Submitted!")).not.toBeInTheDocument();
  });

  it("clears whitespace errors once the fields contain a real value", async () => {
    const user = userEvent.setup();
    render(<FormPage />);
    const email = screen.getByLabelText("Email");
    const bio = screen.getByLabelText("Bio");

    await user.type(email, "   ");
    await user.type(bio, "   ");
    setSeats(2);
    await submit(user);
    expect(summary()).toHaveTextContent("Email is required");
    expect(summary()).toHaveTextContent("Bio is required");

    await user.clear(email);
    await user.type(email, "person@example.com");
    await user.clear(bio);
    await user.type(bio, "Builds cars");
    await submit(user);

    const alert = summary();
    expect(alert).toHaveTextContent("1 field needs attention");
    expect(alert).toHaveTextContent("Team is required");
    expect(alert).not.toHaveTextContent("Email is required");
    expect(alert).not.toHaveTextContent("Bio is required");
    expect(email).not.toHaveAttribute("aria-invalid", "true");
    expect(bio).not.toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveValue("person@example.com");
    expect(bio).toHaveValue("Builds cars");
    expect(screen.queryByText("Submitted!")).not.toBeInTheDocument();
  });

  it("submits surrounding spaces with a real value and does not trim them", async () => {
    const user = userEvent.setup();
    render(<FormPage />);
    const email = screen.getByLabelText("Email");
    const bio = screen.getByLabelText("Bio");

    await user.type(email, "  a@b.com  ");
    await user.type(bio, "  hello  ");
    setSeats(2);
    await user.click(screen.getByRole("combobox", { name: "Team" }));
    await user.click(screen.getByRole("option", { name: "Ferrari" }));
    await submit(user);

    expect(email).toHaveValue("  a@b.com  ");
    expect(bio).toHaveValue("  hello  ");
    expect(screen.getByLabelText("Seats")).toHaveValue("2");
    expect(screen.getByRole("combobox", { name: "Team" })).toHaveTextContent("Ferrari");
    expect(screen.getByText("Submitted!")).toBeInTheDocument();
    expect(summary()).not.toHaveTextContent("is required");
    expect(email).not.toHaveAttribute("aria-invalid", "true");
    expect(bio).not.toHaveAttribute("aria-invalid", "true");
  });
});
