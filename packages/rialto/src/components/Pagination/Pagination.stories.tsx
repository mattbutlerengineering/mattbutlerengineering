import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { Pagination } from "./Pagination";

const meta: Meta<typeof Pagination> = {
  title: "Data Display/Pagination",
  component: Pagination,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  args: {
    onChange: fn(),
  },
  argTypes: {
    siblingCount: {
      control: { type: "number", min: 0, max: 3 },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Pagination>;

export const Default: Story = {
  args: {
    page: 3,
    totalPages: 5,
  },
};

export const FirstPage: Story = {
  args: {
    page: 1,
    totalPages: 20,
  },
};

export const LastPage: Story = {
  args: {
    page: 20,
    totalPages: 20,
  },
};

export const ManyPagesWithEllipsis: Story = {
  args: {
    page: 10,
    totalPages: 50,
    siblingCount: 1,
  },
};

export const WiderSiblingCount: Story = {
  args: {
    page: 10,
    totalPages: 50,
    siblingCount: 2,
  },
};

function ControlledDemo() {
  const [page, setPage] = useState(1);
  return <Pagination page={page} totalPages={10} onChange={setPage} />;
}

export const Controlled: Story = {
  render: () => <ControlledDemo />,
};
