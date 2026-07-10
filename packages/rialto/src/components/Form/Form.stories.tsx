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
    await expect(canvas.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    await expect(canvas.getByRole("alert")).toHaveTextContent("Email is required");
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
