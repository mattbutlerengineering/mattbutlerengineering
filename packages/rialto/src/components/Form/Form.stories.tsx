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
    // Two surfaces carry the error: the field's inline message (referenced by the
    // input's aria-describedby) and the form's error summary. Assert each on its own
    // so deleting either one fails the story.
    const describedBy = (email.getAttribute("aria-describedby") ?? "").split(" ");
    const alerts = canvas.getAllByRole("alert");
    const fieldError = alerts.find((alert) => describedBy.includes(alert.id));
    const summary = alerts.find((alert) => alert !== fieldError);
    await expect(fieldError).toHaveTextContent("Email is required");
    await expect(summary).toHaveTextContent("Email is required");
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
