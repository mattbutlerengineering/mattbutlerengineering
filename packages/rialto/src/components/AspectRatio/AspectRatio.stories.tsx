import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties } from "react";
import { AspectRatio } from "./AspectRatio";

const meta: Meta<typeof AspectRatio> = {
  title: "Layout/AspectRatio",
  component: AspectRatio,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    ratio: {
      control: "number",
    },
  },
};

export default meta;
type Story = StoryObj<typeof AspectRatio>;

const placeholderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  height: "100%",
  background: "var(--rialto-surface-recessed)",
  color: "var(--rialto-text-secondary)",
  fontSize: "14px",
};

export const Widescreen: Story = {
  args: {
    ratio: 16 / 9,
    children: <div style={placeholderStyle}>16:9</div>,
  },
};

export const Square: Story = {
  args: {
    ratio: 1,
    children: <div style={placeholderStyle}>1:1</div>,
  },
};

export const Standard: Story = {
  args: {
    ratio: 4 / 3,
    children: <div style={placeholderStyle}>4:3</div>,
  },
};

export const Portrait: Story = {
  args: {
    ratio: 9 / 16,
    children: <div style={placeholderStyle}>9:16</div>,
  },
};

export const WithImage: Story = {
  args: {
    ratio: 16 / 9,
    children: (
      <img
        src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800"
        alt="Mountain landscape"
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    ),
  },
};
