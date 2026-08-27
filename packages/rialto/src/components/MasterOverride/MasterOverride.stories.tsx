import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { MasterOverride, OverridePanel } from "./MasterOverride";

const meta: Meta<typeof MasterOverride> = {
  title: "Specialty/MasterOverride",
  component: MasterOverride,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    onChange: { action: "changed" },
    size: {
      control: { type: "select" },
      options: ["sm", "md", "lg"],
    },
    variant: {
      control: { type: "select" },
      options: ["default", "warning", "danger"],
    },
    labelTransition: {
      control: { type: "select" },
      options: ["fade", "splitflap"],
    },
    feedback: {
      control: { type: "select" },
      options: ["none", "click", "haptic", "both"],
    },
    disabled: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof MasterOverride>;

function ControlledDemo(
  props: Omit<React.ComponentProps<typeof MasterOverride>, "on" | "onChange">
) {
  const [on, setOn] = useState(false);
  return <MasterOverride {...props} on={on} onChange={setOn} />;
}

export const Default: Story = {
  render: (args) => <ControlledDemo {...args} label={args.label} />,
  args: {
    label: "Reactor Core",
    description: "Engages the primary reactor override.",
  },
};

export const Danger: Story = {
  render: (args) => <ControlledDemo {...args} label={args.label} />,
  args: {
    label: "Purge Sequence",
    variant: "danger",
    description: "Irreversibly purges all pending transactions.",
    idleLabel: "SAFE",
    activeLabel: "ARMED",
  },
};

export const RequiresHold: Story = {
  render: (args) => <ControlledDemo {...args} label={args.label} />,
  args: {
    label: "Launch Control",
    variant: "warning",
    requireHold: 1200,
    feedback: "click",
  },
};

export const SplitFlapLabel: Story = {
  render: (args) => <ControlledDemo {...args} label={args.label} />,
  args: {
    label: "Countermeasures",
    labelTransition: "splitflap",
    idleLabel: "OFF",
    activeLabel: "ON",
  },
};

function PanelDemo() {
  const [coreOn, setCoreOn] = useState(false);
  const [alarmOn, setAlarmOn] = useState(false);
  return (
    <OverridePanel title="Control Console">
      <MasterOverride label="Core" on={coreOn} onChange={setCoreOn} size="sm" />
      <MasterOverride label="Alarm" on={alarmOn} onChange={setAlarmOn} size="sm" variant="danger" />
    </OverridePanel>
  );
}

export const Panel: Story = {
  render: () => <PanelDemo />,
};

export const Disabled: Story = {
  args: {
    label: "Locked Override",
    on: false,
    disabled: true,
  },
};
