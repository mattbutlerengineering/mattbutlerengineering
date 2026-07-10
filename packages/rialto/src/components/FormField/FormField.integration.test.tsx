/**
 * Integration coverage: FormField + Form wired to each of the five field
 * primitives named in the acceptance criteria. Each case drives a failed
 * submit (empty/required value) then a valid submit, asserting the field
 * surfaces the validation error and the Form calls onValidSubmit once fixed.
 */
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Form } from "../Form/Form";
import { Input } from "../Input/Input";
import { TextArea } from "../TextArea/TextArea";
import { NumberInput } from "../NumberInput/NumberInput";
import { Select } from "../Select/Select";
import { Combobox } from "../Combobox/Combobox";
import { FormField } from "./FormField";

// jsdom does not implement scrollIntoView (Select/Combobox scroll the focused
// option into view when navigating with the keyboard/mouse).
window.HTMLElement.prototype.scrollIntoView = vi.fn();

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Submit" }));
}

describe("FormField integration", () => {
  it("works with Input", async () => {
    const user = userEvent.setup();
    const onValidSubmit = vi.fn();
    function Demo() {
      const [value, setValue] = useState("");
      return (
        <Form onValidSubmit={onValidSubmit}>
          <FormField name="email" validate={() => (value ? undefined : "Required")}>
            <Input label="Email" value={value} onChange={(e) => setValue(e.target.value)} />
          </FormField>
          <button type="submit">Submit</button>
        </Form>
      );
    }
    render(<Demo />);
    await submit(user);
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    await user.type(screen.getByLabelText("Email"), "a@b.com");
    await submit(user);
    expect(onValidSubmit).toHaveBeenCalledTimes(1);
  });

  it("works with TextArea", async () => {
    const user = userEvent.setup();
    const onValidSubmit = vi.fn();
    function Demo() {
      const [value, setValue] = useState("");
      return (
        <Form onValidSubmit={onValidSubmit}>
          <FormField name="bio" validate={() => (value ? undefined : "Required")}>
            <TextArea label="Bio" value={value} onChange={(e) => setValue(e.target.value)} />
          </FormField>
          <button type="submit">Submit</button>
        </Form>
      );
    }
    render(<Demo />);
    await submit(user);
    expect(screen.getByLabelText("Bio")).toHaveAttribute("aria-invalid", "true");
    await user.type(screen.getByLabelText("Bio"), "Hello");
    await submit(user);
    expect(onValidSubmit).toHaveBeenCalledTimes(1);
  });

  it("works with NumberInput", async () => {
    const user = userEvent.setup();
    const onValidSubmit = vi.fn();
    function Demo() {
      const [value, setValue] = useState(0);
      return (
        <Form onValidSubmit={onValidSubmit}>
          <FormField name="qty" validate={() => (value > 0 ? undefined : "Must be positive")}>
            <NumberInput label="Quantity" value={value} onChange={setValue} min={0} />
          </FormField>
          <button type="submit">Submit</button>
        </Form>
      );
    }
    render(<Demo />);
    await submit(user);
    expect(screen.getByLabelText("Quantity")).toHaveAttribute("aria-invalid", "true");
    await user.click(screen.getByLabelText("Increase"));
    await submit(user);
    expect(onValidSubmit).toHaveBeenCalledTimes(1);
  });

  it("works with Select", async () => {
    const user = userEvent.setup();
    const onValidSubmit = vi.fn();
    function Demo() {
      const [value, setValue] = useState("");
      return (
        <Form onValidSubmit={onValidSubmit}>
          <FormField name="country" validate={() => (value ? undefined : "Required")}>
            <Select
              label="Country"
              value={value}
              onChange={setValue}
              options={[
                { value: "us", label: "United States" },
                { value: "ca", label: "Canada" },
              ]}
            />
          </FormField>
          <button type="submit">Submit</button>
        </Form>
      );
    }
    render(<Demo />);
    await submit(user);
    const trigger = screen.getByRole("combobox", { name: "Country" });
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "Canada" }));
    await submit(user);
    expect(onValidSubmit).toHaveBeenCalledTimes(1);
  });

  it("works with Combobox", async () => {
    const user = userEvent.setup();
    const onValidSubmit = vi.fn();
    function Demo() {
      const [value, setValue] = useState("");
      return (
        <Form onValidSubmit={onValidSubmit}>
          <FormField name="fruit" validate={() => (value ? undefined : "Required")}>
            <Combobox
              label="Fruit"
              value={value}
              onChange={setValue}
              options={[
                { value: "apple", label: "Apple" },
                { value: "banana", label: "Banana" },
              ]}
            />
          </FormField>
          <button type="submit">Submit</button>
        </Form>
      );
    }
    render(<Demo />);
    await submit(user);
    const combo = screen.getByRole("combobox", { name: "Fruit" });
    expect(combo).toHaveAttribute("aria-invalid", "true");
    await user.type(combo, "Apple");
    await user.click(screen.getByRole("option", { name: "Apple" }));
    await submit(user);
    expect(onValidSubmit).toHaveBeenCalledTimes(1);
  });
});
