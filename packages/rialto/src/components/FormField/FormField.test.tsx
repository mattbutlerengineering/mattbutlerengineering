import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Form } from "../Form/Form";
import { Input } from "../Input/Input";
import { FormField } from "./FormField";

describe("FormField", () => {
  it("renders the wrapped child", () => {
    render(
      <Form>
        <FormField name="email">
          <Input label="Email" />
        </FormField>
      </Form>
    );
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("does not mark the field invalid before submit", () => {
    render(
      <Form>
        <FormField name="email" validate={() => "Email is required"}>
          <Input label="Email" />
        </FormField>
      </Form>
    );
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("marks the field invalid and shows the validation message as its hint after a failed submit", async () => {
    const user = userEvent.setup();
    render(
      <Form>
        <FormField name="email" validate={() => "Email is required"}>
          <Input label="Email" />
        </FormField>
        <button type="submit">Submit</button>
      </Form>
    );
    await user.click(screen.getByRole("button", { name: "Submit" }));
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedById = input.getAttribute("aria-describedby");
    expect(document.getElementById(describedById!)).toHaveTextContent("Email is required");
  });

  it("clears the invalid state once the field becomes valid on a subsequent submit", async () => {
    const user = userEvent.setup();
    let value = "";
    function Wrapper() {
      return (
        <Form>
          <FormField name="email" validate={() => (value ? undefined : "Email is required")}>
            <Input
              label="Email"
              value={value}
              onChange={(e) => {
                value = e.target.value;
              }}
            />
          </FormField>
          <button type="submit">Submit</button>
        </Form>
      );
    }
    const { rerender } = render(<Wrapper />);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");

    value = "person@example.com";
    rerender(<Wrapper />);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("preserves an externally-forced error even when the field's own validation passes", () => {
    render(
      <Form>
        <FormField name="email" validate={() => undefined}>
          <Input label="Email" error />
        </FormField>
      </Form>
    );
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });
});
