import type { Meta, StoryObj } from "@storybook/react-vite";
import { InputGroup } from "./InputGroup";
import { Input } from "../Input/Input";
import { Button } from "../Button/Button";
import { Select } from "../Select/Select";

const meta: Meta<typeof InputGroup> = {
  title: "Forms/InputGroup",
  component: InputGroup,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof InputGroup>;

export const InputWithButton: Story = {
  render: () => (
    <InputGroup style={{ width: "360px" }}>
      <Input placeholder="Search…" style={{ flex: 1 }} />
      <Button variant="primary">Search</Button>
    </InputGroup>
  ),
};

export const SelectWithInput: Story = {
  render: () => (
    <InputGroup style={{ width: "360px" }}>
      <Select
        options={[
          { value: "https", label: "https://" },
          { value: "http", label: "http://" },
        ]}
        value="https"
        style={{ width: "120px" }}
      />
      <Input placeholder="example.com" style={{ flex: 1 }} />
    </InputGroup>
  ),
};

export const InputRange: Story = {
  render: () => (
    <InputGroup style={{ width: "320px" }}>
      <Input placeholder="Min" style={{ flex: 1 }} type="number" />
      <Input placeholder="Max" style={{ flex: 1 }} type="number" />
    </InputGroup>
  ),
};

export const InputWithGhostButton: Story = {
  render: () => (
    <InputGroup style={{ width: "360px" }}>
      <Input placeholder="Enter coupon code" style={{ flex: 1 }} />
      <Button variant="ghost">Apply</Button>
    </InputGroup>
  ),
};
