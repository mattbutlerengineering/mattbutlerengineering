import type { Meta, StoryObj } from "@storybook/react-vite";
import { ContextMenu } from "./ContextMenu";
import { Text } from "../Text/Text";
import { within, userEvent, expect } from "@storybook/test";

const meta: Meta<typeof ContextMenu> = {
  title: "Overlay/ContextMenu",
  component: ContextMenu,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ContextMenu>;

export const Default: Story = {
  render: () => (
    <ContextMenu
      items={[
        { id: "copy", label: "Copy", shortcut: "Ctrl+C", onSelect: () => {} },
        { id: "paste", label: "Paste", shortcut: "Ctrl+V", onSelect: () => {} },
        { type: "divider" },
        { id: "delete", label: "Delete", destructive: true, onSelect: () => {} },
      ]}
    >
      <div
        style={{ padding: "2rem", border: "1px solid var(--rialto-border)", borderRadius: "8px" }}
      >
        <Text>Right-click this area to open context menu</Text>
      </div>
    </ContextMenu>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const target = canvas.getByText("Right-click this area");
    await userEvent.pointer({ keys: "[MouseRight]", target: target });
    await expect(canvas.getByText("Copy")).toBeInTheDocument();
  },
};

export const WithNested: Story = {
  render: () => (
    <ContextMenu
      items={[
        { id: "new-file", label: "New File", onSelect: () => {} },
        { type: "divider" },
        { id: "share", label: "Share", onSelect: () => {} },
        { id: "rename", label: "Rename", onSelect: () => {} },
        { id: "delete", label: "Delete", destructive: true, onSelect: () => {} },
      ]}
    >
      <div
        style={{ padding: "2rem", border: "1px solid var(--rialto-border)", borderRadius: "8px" }}
      >
        <Text>Right-click for file operations</Text>
      </div>
    </ContextMenu>
  ),
};

export const WithLabels: Story = {
  render: () => (
    <ContextMenu
      items={[
        { type: "label", label: "Actions" },
        { id: "edit", label: "Edit", onSelect: () => {} },
        { id: "view", label: "View", onSelect: () => {} },
        { type: "divider" },
        { type: "label", label: "Danger Zone" },
        { id: "delete", label: "Delete", destructive: true, onSelect: () => {} },
      ]}
    >
      <div
        style={{ padding: "2rem", border: "1px solid var(--rialto-border)", borderRadius: "8px" }}
      >
        <Text>Right-click for categorized menu</Text>
      </div>
    </ContextMenu>
  ),
};
