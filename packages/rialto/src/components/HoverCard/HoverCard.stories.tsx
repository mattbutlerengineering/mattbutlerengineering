import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { HoverCard } from "./HoverCard";

const ProfilePreview = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", minWidth: "200px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: "var(--rialto-accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--rialto-surface)",
          fontWeight: 500,
          fontSize: "1rem",
        }}
      >
        MB
      </div>
      <div>
        <div style={{ fontWeight: 500, fontSize: "var(--rialto-text-sm)" }}>Matt Butler</div>
        <div style={{ fontSize: "var(--rialto-text-xs)", color: "var(--rialto-text-secondary)" }}>
          @mattbutler
        </div>
      </div>
    </div>
    <p
      style={{
        fontSize: "var(--rialto-text-xs)",
        color: "var(--rialto-text-secondary)",
        margin: 0,
      }}
    >
      Building AI-native software tools. Creator of Rialto design system.
    </p>
    <div style={{ display: "flex", gap: "1rem", fontSize: "var(--rialto-text-xs)" }}>
      <span>
        <strong>42</strong> Following
      </span>
      <span>
        <strong>1.2k</strong> Followers
      </span>
    </div>
  </div>
);

const ReservationPreview = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", minWidth: "220px" }}>
    <div style={{ fontWeight: 500, fontSize: "var(--rialto-text-sm)" }}>The Bistro — Table 4</div>
    <div style={{ fontSize: "var(--rialto-text-xs)", color: "var(--rialto-text-secondary)" }}>
      Friday, May 9 &middot; 7:00 PM &middot; 4 guests
    </div>
    <div
      style={{
        padding: "0.25rem 0.5rem",
        borderRadius: "var(--rialto-radius-sharp)",
        background: "var(--rialto-success-muted)",
        color: "var(--rialto-success)",
        fontSize: "var(--rialto-text-xs)",
        width: "fit-content",
      }}
    >
      Confirmed
    </div>
  </div>
);

const meta: Meta<typeof HoverCard> = {
  title: "Feedback/HoverCard",
  component: HoverCard,
  tags: ["autodocs"],
  argTypes: {
    placement: {
      control: { type: "select" },
      options: ["top", "bottom"],
    },
    openDelay: { control: { type: "number" } },
    closeDelay: { control: { type: "number" } },
  },
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof HoverCard>;

export const Default: Story = {
  args: {
    content: <ProfilePreview />,
    openDelay: 0,
    placement: "bottom",
    children: (
      <a href="/preview" style={{ color: "var(--rialto-accent)", textDecoration: "underline" }}>
        @mattbutler
      </a>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("link");
    await expect(trigger).toBeInTheDocument();
    await userEvent.hover(trigger);
    const card = await canvas.findByRole("dialog");
    await expect(card).toBeInTheDocument();
    await userEvent.unhover(trigger);
  },
};

export const PlacementTop: Story = {
  args: {
    content: <ProfilePreview />,
    placement: "top",
    openDelay: 0,
    children: (
      <a href="/preview" style={{ color: "var(--rialto-accent)", textDecoration: "underline" }}>
        Hover (top)
      </a>
    ),
  },
};

export const PlacementBottom: Story = {
  args: {
    content: <ReservationPreview />,
    placement: "bottom",
    openDelay: 0,
    children: (
      <a href="/preview" style={{ color: "var(--rialto-accent)", textDecoration: "underline" }}>
        Table reservation
      </a>
    ),
  },
};

export const WithCustomDelays: Story = {
  args: {
    content: <ProfilePreview />,
    openDelay: 600,
    closeDelay: 400,
    children: (
      <a href="/preview" style={{ color: "var(--rialto-accent)", textDecoration: "underline" }}>
        Slow open, slow close
      </a>
    ),
  },
};
