import { describe, expect, it, vi } from "vitest";
import type { ChangeEvent, ElementType, ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsExamplePage } from "./SettingsExamplePage.js";

vi.mock("@mattbutlerengineering/rialto", () => {
  const Text = ({
    as,
    children,
    role,
  }: {
    as?: ElementType;
    children?: ReactNode;
    role?: string;
  }) => {
    const Tag = as ?? "p";
    return <Tag role={role}>{children}</Tag>;
  };
  const Stack = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Card = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Divider = () => <div role="separator" />;
  const Button = ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  );
  const Input = ({
    label,
    value,
    defaultValue,
    onChange,
    error,
    hint,
  }: {
    label?: string;
    value?: string;
    defaultValue?: string;
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    error?: boolean;
    hint?: string;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        onChange={onChange}
        aria-invalid={error || undefined}
      />
      {hint ? <span>{hint}</span> : null}
    </label>
  );
  const Select = ({
    label,
    value,
    onChange,
  }: {
    label?: string;
    value?: string;
    onChange?: (value: string) => void;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value ?? ""}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </label>
  );
  const Toggle = ({ label }: { label?: string }) => <div>{label}</div>;
  return { Text, Stack, Card, Divider, Button, Input, Select, Toggle };
});

describe("SettingsExamplePage", () => {
  it("renders a divider between the profile fields and Save Profile", () => {
    render(<SettingsExamplePage />);
    // The layout divider sits above the notes; the profile card adds a second one.
    expect(screen.getAllByRole("separator")).toHaveLength(2);
  });

  it("shows name and email errors and does not confirm a blank name with a bad email", () => {
    render(<SettingsExamplePage />);
    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not an email 😀" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Profile" }));

    expect(screen.getByLabelText("Full Name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/full name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("confirms a valid profile save", () => {
    render(<SettingsExamplePage />);
    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Profile" }));

    expect(screen.getByRole("status")).toHaveTextContent(/profile saved/i);
    expect(screen.queryByText(/full name is required/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/valid email/i)).not.toBeInTheDocument();
  });

  it("clears Profile saved when the form is edited and shows it again after the next valid save", () => {
    render(<SettingsExamplePage />);

    fireEvent.click(screen.getByRole("button", { name: "Save Profile" }));
    expect(screen.getByRole("status")).toHaveTextContent(/profile saved/i);

    fireEvent.change(screen.getByLabelText("Full Name"), {
      target: { value: "Changed unsaved" },
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "zzz" } });
    // Validation stays on submit: an edit clears the confirmation and does not flag the field yet.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/valid email/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save Profile" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText(/valid email/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Profile" }));
    expect(screen.getByRole("status")).toHaveTextContent(/profile saved/i);
    expect(screen.queryByText(/valid email/i)).not.toBeInTheDocument();
  });

  it.each([
    ["Role", "front-desk"],
    ["Timezone", "Europe/London"],
  ])("clears Profile saved when %s changes and shows it again on the next save", (label, value) => {
    render(<SettingsExamplePage />);
    fireEvent.click(screen.getByRole("button", { name: "Save Profile" }));
    expect(screen.getByRole("status")).toHaveTextContent(/profile saved/i);

    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save Profile" }));
    expect(screen.getByRole("status")).toHaveTextContent(/profile saved/i);
  });

  it("rejects a whitespace name and still submits when Enter is pressed on Save Profile", async () => {
    const user = userEvent.setup();
    render(<SettingsExamplePage />);
    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not an email 😀" } });

    screen.getByRole("button", { name: "Save Profile" }).focus();
    await user.keyboard("{Enter}");

    expect(screen.getByText(/full name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    screen.getByRole("button", { name: "Save Profile" }).focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("status")).toHaveTextContent(/profile saved/i);
  });
});
