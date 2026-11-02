import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { within, userEvent, expect, waitFor } from "@storybook/test";
import { Dialog } from "./Dialog";
import { Button } from "../Button/Button";
import { Combobox } from "../Combobox/Combobox";
import { Autocomplete } from "../Autocomplete/Autocomplete";
import { DropdownMenu } from "../DropdownMenu/DropdownMenu";
import { Popover } from "../Popover/Popover";

/**
 * Real-browser checks that floating controls hosted in a Dialog are not clipped
 * by its scrolling body. jsdom has no layout, so these run in Chromium
 * (`pnpm test:storybook`). A control counts as unclipped when the point at the
 * centre of its last row hit-tests to that row.
 */
const meta: Meta<typeof Dialog> = {
  title: "Overlay/Dialog/Hosted overlays",
  component: Dialog,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof Dialog>;

const fruits = ["Apple", "Banana", "Cherry", "Damson", "Elderberry"].map((label) => ({
  value: label.toLowerCase(),
  label,
}));

function Host({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Hosted"
      footer={<Button onClick={() => setOpen(false)}>Done</Button>}
    >
      {children}
    </Dialog>
  );
}

/** True when the centre of `row` is what the browser paints at that point. */
function isPainted(row: Element): boolean {
  const box = row.getBoundingClientRect();
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  return hit !== null && row.contains(hit);
}

function expectInViewport(el: Element) {
  const box = el.getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(document.documentElement.clientWidth);
  expect(box.bottom).toBeLessThanOrEqual(document.documentElement.clientHeight);
}

export const ComboboxInDialog: Story = {
  render: () => (
    <Host>
      <Combobox label="Fruit" options={fruits} />
    </Host>
  ),
  play: async () => {
    const body = within(document.body);
    await userEvent.click(await body.findByRole("combobox"));
    const options = await body.findAllByRole("option");
    await waitFor(() => expect(isPainted(options[options.length - 1]!)).toBe(true));
    expectInViewport(body.getByRole("listbox"));
  },
};

export const AutocompleteInDialog: Story = {
  render: () => (
    <Host>
      <Autocomplete label="Fruit" options={fruits} />
    </Host>
  ),
  play: async () => {
    const body = within(document.body);
    await userEvent.type(await body.findByRole("combobox"), "e");
    const options = await body.findAllByRole("option");
    await waitFor(() => expect(isPainted(options[options.length - 1]!)).toBe(true));
    expectInViewport(body.getByRole("listbox"));
  },
};

export const DropdownMenuInDialog: Story = {
  render: () => (
    <Host>
      <DropdownMenu
        trigger={<Button>Actions</Button>}
        items={[
          { id: "a", label: "Edit" },
          { id: "b", label: "Duplicate" },
          { id: "c", label: "Archive" },
          { id: "d", label: "Delete", destructive: true },
        ]}
      />
    </Host>
  ),
  play: async () => {
    const body = within(document.body);
    await userEvent.click(await body.findByRole("button", { name: "Actions" }));
    const items = await body.findAllByRole("menuitem");
    await waitFor(() => expect(isPainted(items[items.length - 1]!)).toBe(true));
    expectInViewport(body.getByRole("menu"));
  },
};

function GrowingPopover() {
  const [rows, setRows] = useState(1);
  return (
    <Popover trigger={<Button>Grow</Button>} placement="bottom">
      <Button onClick={() => setRows(60)}>More</Button>
      {Array.from({ length: rows }, (_, i) => (
        <p key={i}>Row {i}</p>
      ))}
    </Popover>
  );
}

export const PopoverRecapsWhenContentGrows: Story = {
  render: () => (
    <Host>
      <GrowingPopover />
    </Host>
  ),
  play: async () => {
    const body = within(document.body);
    await userEvent.click(await body.findByRole("button", { name: "Grow" }));
    await userEvent.click(await body.findByRole("button", { name: "More" }));
    const panel = await body.findByRole("dialog", { name: "Popover" });
    await waitFor(() => expectInViewport(panel));
  },
};
