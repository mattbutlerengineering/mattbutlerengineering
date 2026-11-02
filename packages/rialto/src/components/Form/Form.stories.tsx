import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, userEvent, expect } from "@storybook/test";
import { Form } from "./Form";
import { FormField } from "../FormField/FormField";
import { Input } from "../Input/Input";
import { Button } from "../Button/Button";

const meta: Meta<typeof Form> = {
  title: "Form/Form",
  component: Form,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Form>;

function SignUpDemo() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <Form onValidSubmit={() => setSubmitted(true)} style={{ width: "320px" }}>
      <FormField name="email" validate={() => (email ? undefined : "Email is required")}>
        <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormField>
      <Button type="submit">Submit</Button>
      {submitted && <p>Submitted!</p>}
    </Form>
  );
}

export const Default: Story = {
  render: () => <SignUpDemo />,
};

export const InvalidSubmit: Story = {
  render: () => <SignUpDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));
    const email = canvas.getByLabelText("Email");
    await expect(email).toHaveAttribute("aria-invalid", "true");
    // Two surfaces carry the error but only one announces it: the form's summary is
    // the single role=alert; the field's inline message is linked through the input's
    // aria-describedby and is not a live region. Assert each on its own so deleting
    // either surface fails the story.
    const summary = canvas.getByRole("alert");
    await expect(summary).toHaveTextContent("Email is required");
    const fieldError = document.getElementById(email.getAttribute("aria-describedby") ?? "");
    await expect(fieldError).toHaveTextContent("Email is required");
    await expect(fieldError).not.toBe(summary);
    await expect(fieldError).not.toHaveAttribute("role");
  },
};

export const ValidSubmit: Story = {
  render: () => <SignUpDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Email"), "person@example.com");
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));
    await expect(canvas.getByText("Submitted!")).toBeInTheDocument();
  },
};
