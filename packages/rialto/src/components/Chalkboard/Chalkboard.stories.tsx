import type { Meta, StoryObj } from "@storybook/react-vite";
import { Chalkboard, ChalkboardItem, ChalkboardSection } from "./Chalkboard";

const meta: Meta<typeof Chalkboard> = {
  title: "Data Display/Chalkboard",
  component: Chalkboard,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["slate", "green"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Chalkboard>;

export const Default: Story = {
  args: {
    title: "Today's Specials",
    subtitle: "March 15",
    children: (
      <ChalkboardSection heading="Starters">
        <ChalkboardItem name="Crab Cakes" price="$14" description="Served with remoulade" />
        <ChalkboardItem name="French Onion Soup" price="$9" />
      </ChalkboardSection>
    ),
  },
};

export const MultipleSections: Story = {
  args: {
    title: "Dinner Menu",
    children: (
      <>
        <ChalkboardSection heading="Starters">
          <ChalkboardItem name="Crab Cakes" price="$14" />
          <ChalkboardItem name="French Onion Soup" price="$9" />
        </ChalkboardSection>
        <ChalkboardSection heading="Mains">
          <ChalkboardItem name="Grilled Salmon" price="$28" description="With roasted vegetables" />
          <ChalkboardItem name="Ribeye Steak" price="$36" soldOut />
        </ChalkboardSection>
      </>
    ),
  },
};

export const GreenVariant: Story = {
  args: {
    title: "Weekly Special",
    subtitle: "Fresh catch",
    variant: "green",
    children: (
      <ChalkboardSection>
        <ChalkboardItem name="Lobster Roll" price="$22" />
        <ChalkboardItem name="Clam Chowder" price="$11" />
      </ChalkboardSection>
    ),
  },
};

export const Framed: Story = {
  args: {
    title: "Happy Hour",
    framed: true,
    children: (
      <ChalkboardSection>
        <ChalkboardItem name="House Wine" price="$7" />
        <ChalkboardItem name="Draft Beer" price="$5" />
      </ChalkboardSection>
    ),
  },
};
