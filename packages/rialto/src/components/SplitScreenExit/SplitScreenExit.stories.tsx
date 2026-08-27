import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties } from "react";
import { SplitScreenExit } from "./SplitScreenExit";

const meta: Meta<typeof SplitScreenExit> = {
  title: "Layout/SplitScreenExit",
  component: SplitScreenExit,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    onExitComplete: { action: "exitComplete" },
  },
};

export default meta;
type Story = StoryObj<typeof SplitScreenExit>;

const panelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "320px",
  background: "var(--rialto-surface)",
  color: "var(--rialto-text-primary)",
  fontSize: "20px",
};

export const Idle: Story = {
  args: {
    active: false,
    children: <div style={panelStyle}>Sign in form</div>,
  },
};

function TriggeredDemo() {
  const [active, setActive] = useState(false);
  return (
    <div>
      <SplitScreenExit
        active={active}
        announcement="Signing you in"
        onExitComplete={() => setActive(false)}
      >
        <div style={panelStyle}>Welcome back</div>
      </SplitScreenExit>
      <div style={{ padding: "16px" }}>
        <button type="button" onClick={() => setActive(true)} disabled={active}>
          Trigger exit
        </button>
      </div>
    </div>
  );
}

export const Triggered: Story = {
  render: () => <TriggeredDemo />,
};

export const WithAnnouncement: Story = {
  args: {
    active: false,
    announcement: "Signing you in",
    children: <div style={panelStyle}>Dashboard preview</div>,
  },
};
