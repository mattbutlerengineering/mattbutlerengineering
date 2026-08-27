import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { DisabledTooltip } from "./DisabledTooltip";
import { Button } from "../Button/Button";

const meta: Meta<typeof DisabledTooltip> = {
  title: "Feedback/DisabledTooltip",
  component: DisabledTooltip,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    disabled: { control: "boolean" },
    disabledReason: { control: "text" },
  },
};

export default meta;
type Story = StoryObj<typeof DisabledTooltip>;

export const Enabled: Story = {
  args: {
    disabled: false,
    disabledReason: "You do not have permission to perform this action",
    children: <Button>Delete reservation</Button>,
  },
};

export const DisabledWithReason: Story = {
  args: {
    disabled: true,
    disabledReason: "You do not have permission to perform this action",
    children: <Button disabled>Delete reservation</Button>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button");
    await expect(trigger).toBeInTheDocument();
    await userEvent.hover(trigger);
    const tooltip = await canvas.findByRole("tooltip");
    await expect(tooltip).toHaveTextContent(/permission/i);
    await userEvent.unhover(trigger);
  },
};

export const DisabledWithoutReason: Story = {
  args: {
    disabled: true,
    children: <Button disabled>Delete reservation</Button>,
  },
};
