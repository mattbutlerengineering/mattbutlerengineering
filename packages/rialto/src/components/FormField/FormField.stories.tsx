import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FormField } from "./FormField";
import { Form } from "../Form/Form";
import { Input } from "../Input/Input";

const meta: Meta<typeof FormField> = {
  title: "Form/FormField",
  component: FormField,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <Form style={{ width: "320px" }}>
        <Story />
      </Form>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof FormField>;

function RequiredEmailField() {
  const [email, setEmail] = useState("");
  return (
    <FormField name="email" validate={() => (email ? undefined : "Email is required")}>
      <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
    </FormField>
  );
}

export const Default: Story = {
  render: () => <RequiredEmailField />,
};
