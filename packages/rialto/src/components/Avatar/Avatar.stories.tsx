import type { Meta, StoryObj } from "@storybook/react-vite";
import { within, expect } from "@storybook/test";
import { Avatar, AvatarGroup } from "./Avatar";

const meta: Meta<typeof Avatar> = {
  title: "Display/Avatar",
  component: Avatar,
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: { type: "radio" },
      options: ["sm", "md", "lg", "xl"],
    },
    status: {
      control: { type: "select" },
      options: ["online", "offline", "busy", "away"],
    },
    transition: {
      control: { type: "radio" },
      options: ["fade", "splitflap"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Avatar>;

export const Default: Story = {
  args: {
    name: "Matt Butler",
    size: "md",
  },
};

// A 1x1 GIF as a data: URI, so the story needs no network.
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export const WithImage: Story = {
  args: {
    src: PIXEL,
    name: "User Name",
    size: "lg",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const image = await canvas.findByRole("img", { name: "User Name" });
    await expect(image).toHaveAttribute("src", PIXEL);
    await expect(canvas.queryByText("UN")).not.toBeInTheDocument();
  },
};

export const ImageFallback: Story = {
  args: {
    // Deterministic failure: nothing listens on port 1, so the load errors at once and
    // the fallback shows. A real remote URL would make this story depend on the network.
    src: "http://127.0.0.1:1/avatar.png",
    name: "User Name",
    size: "lg",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Test fallback - when image fails to load, shows initials
    const avatar = await canvas.findByText("UN");
    await expect(avatar).toBeInTheDocument();
  },
};

export const WithStatus: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "1rem" }}>
      <Avatar name="Online User" status="online" />
      <Avatar name="Busy User" status="busy" />
      <Avatar name="Away User" status="away" />
      <Avatar name="Offline User" status="offline" />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
      <Avatar name="Small" size="sm" />
      <Avatar name="Medium" size="md" />
      <Avatar name="Large" size="lg" />
      <Avatar name="Extra Large" size="xl" />
    </div>
  ),
};

export const Group: StoryObj<typeof AvatarGroup> = {
  render: () => (
    <AvatarGroup
      avatars={[
        { name: "Alice", src: "https://i.pravatar.cc/150?u=alice" },
        { name: "Bob", src: "https://i.pravatar.cc/150?u=bob" },
        { name: "Charlie", src: "https://i.pravatar.cc/150?u=charlie" },
        { name: "David", src: "https://i.pravatar.cc/150?u=david" },
        { name: "Eve", src: "https://i.pravatar.cc/150?u=eve" },
      ]}
      max={4}
    />
  ),
};
