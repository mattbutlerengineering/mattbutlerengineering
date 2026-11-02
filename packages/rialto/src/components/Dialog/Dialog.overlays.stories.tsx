import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { within, userEvent, expect, waitFor } from "@storybook/test";
import { Dialog } from "./Dialog";
import { Button } from "../Button/Button";
import { Combobox } from "../Combobox/Combobox";
import { Autocomplete } from "../Autocomplete/Autocomplete";
import { DropdownMenu } from "../DropdownMenu/DropdownMenu";
import { Drawer } from "../Drawer/Drawer";
import { Popover } from "../Popover/Popover";
import { DatePicker } from "../DatePicker/DatePicker";
import axe from "axe-core";

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

/**
 * A field inside a short, clipping, transformed box. `transform` makes the box
 * the containing block of any `position: fixed` descendant and `overflow:
 * hidden` clips whatever is in it, so only a list that is portalled out to the
 * dialog layer AND fixed-positioned stays visible. Dropping either half of
 * `.floating` / `createPortal(listbox, dialogLayer)` leaves the list clipped.
 */
function ClippingTrap({ children }: { children: React.ReactNode }) {
  return (
    <Host>
      <div style={{ transform: "translateZ(0)", overflow: "hidden", height: 80 }}>{children}</div>
    </Host>
  );
}

async function expectLastOptionPainted() {
  const options = await within(document.body).findAllByRole("option");
  await waitFor(() => expect(isPainted(options[options.length - 1]!)).toBe(true));
}

async function expectListboxFixed() {
  const listbox = await within(document.body).findByRole("listbox");
  expect(getComputedStyle(listbox).position).toBe("fixed");
}

export const ComboboxEscapesClippingAncestor: Story = {
  render: () => (
    <ClippingTrap>
      <Combobox label="Fruit" options={fruits} />
    </ClippingTrap>
  ),
  play: async () => {
    await userEvent.click(await within(document.body).findByRole("combobox"));
    await expectLastOptionPainted();
  },
};

export const ComboboxListboxIsFixedInDialog: Story = {
  render: () => (
    <Host>
      <Combobox label="Fruit" options={fruits} />
    </Host>
  ),
  play: async () => {
    await userEvent.click(await within(document.body).findByRole("combobox"));
    await expectListboxFixed();
  },
};

export const AutocompleteEscapesClippingAncestor: Story = {
  render: () => (
    <ClippingTrap>
      <Autocomplete label="Fruit" options={fruits} />
    </ClippingTrap>
  ),
  play: async () => {
    await userEvent.type(await within(document.body).findByRole("combobox"), "e");
    await expectLastOptionPainted();
  },
};

export const AutocompleteListboxIsFixedInDialog: Story = {
  render: () => (
    <Host>
      <Autocomplete label="Fruit" options={fruits} />
    </Host>
  ),
  play: async () => {
    await userEvent.type(await within(document.body).findByRole("combobox"), "e");
    await expectListboxFixed();
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

/** Alpha channel of a computed CSS colour (`rgb()`, `rgba()` or `color(... / a)`). */
function alphaOf(color: string): number {
  const slash = /\/\s*([\d.]+%?)\s*\)/.exec(color);
  const comma = /^rgba\([^)]*,\s*([\d.]+)\s*\)$/.exec(color);
  const raw = slash?.[1] ?? comma?.[1];
  if (raw === undefined) return 1;
  return raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw);
}

export const DropdownMenuIsOpaqueInDialog: Story = {
  render: () => (
    <Host>
      <DropdownMenu trigger={<Button>Actions</Button>} items={[{ id: "a", label: "Edit" }]} />
    </Host>
  ),
  play: async () => {
    const body = within(document.body);
    await userEvent.click(await body.findByRole("button", { name: "Actions" }));
    const menu = await body.findByRole("menu");
    await waitFor(() => expect(alphaOf(getComputedStyle(menu).backgroundColor)).toBe(1));
  },
};

/** Runs `check` with `data-theme` set, restoring the previous theme. */
async function inTheme(theme: "light" | "dark", check: () => Promise<void>) {
  const root = document.documentElement;
  const previous = root.getAttribute("data-theme");
  root.setAttribute("data-theme", theme);
  try {
    await check();
  } finally {
    if (previous === null) root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", previous);
  }
}

function PopoverInDialog() {
  return (
    <Host>
      <Popover trigger={<Button>Details</Button>} placement="bottom">
        <p>Panel text</p>
      </Popover>
    </Host>
  );
}

async function openPopoverPanel() {
  const body = within(document.body);
  await userEvent.click(await body.findByRole("button", { name: "Details" }));
  return body.findByRole("dialog", { name: "Popover" });
}

async function expectPopoverOpaque() {
  const panel = await openPopoverPanel();
  await waitFor(() => expect(alphaOf(getComputedStyle(panel).backgroundColor)).toBe(1));
  // A blur behind an alpha-1 fill is wasted paint.
  expect(getComputedStyle(panel).backdropFilter).toBe("none");
}

/** A glass panel blends with the dialog behind it, so its text has no fixed background (#8140). */
export const PopoverIsOpaqueInDialog: Story = {
  render: () => <PopoverInDialog />,
  play: async () => {
    await inTheme("light", expectPopoverOpaque);
  },
};

export const PopoverIsOpaqueInDialogDark: Story = {
  render: () => <PopoverInDialog />,
  play: async () => {
    await inTheme("dark", expectPopoverOpaque);
  },
};

/** On a plain page nothing blends through the panel, so it keeps its glass. */
export const PopoverKeepsGlassOnPlainPage: Story = {
  render: () => (
    <Popover trigger={<Button>Details</Button>} placement="bottom">
      <p>Panel text</p>
    </Popover>
  ),
  play: async () => {
    await inTheme("light", async () => {
      const panel = await openPopoverPanel();
      await waitFor(() => expect(alphaOf(getComputedStyle(panel).backgroundColor)).toBeLessThan(1));
      expect(getComputedStyle(panel).backdropFilter).not.toBe("none");
    });
  },
};

async function expectNoContrastViolations(panel: HTMLElement) {
  // Mid-entrance the panel is partly transparent, which axe reads as a low-contrast blend.
  await waitFor(() => expect(document.getAnimations()).toHaveLength(0));
  const result = await axe.run(panel, { runOnly: ["color-contrast"] });
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => `${n.target.join(" ")}: ${n.any[0]?.message ?? ""}`),
    }))
  ).toEqual([]);
}

/** jsdom cannot compute colour contrast; Chromium can. */
export const DatePickerPassesContrastInDialog: Story = {
  render: () => (
    <Host>
      <DatePicker label="Day" value="2026-12-01" onChange={() => {}} />
    </Host>
  ),
  play: async () => {
    const body = within(document.body);
    await userEvent.click(await body.findByRole("combobox", { name: "Day" }));
    await expectNoContrastViolations(await body.findByRole("dialog", { name: "Popover" }));
  },
};

function DrawerHost() {
  const [open, setOpen] = useState(true);
  return (
    <Drawer open={open} onClose={() => setOpen(false)} title="Hosted">
      <DatePicker label="Day" value="2026-12-01" onChange={() => {}} />
    </Drawer>
  );
}

export const DatePickerPassesContrastInDrawer: Story = {
  render: () => <DrawerHost />,
  play: async () => {
    const body = within(document.body);
    await userEvent.click(await body.findByRole("combobox", { name: "Day" }));
    await expectNoContrastViolations(await body.findByRole("dialog", { name: "Popover" }));
  },
};

/** Runs `check` with the document in RTL, restoring the previous direction. */
async function inRtl(check: () => Promise<void>) {
  const root = document.documentElement;
  const previous = root.getAttribute("dir");
  root.setAttribute("dir", "rtl");
  try {
    await check();
  } finally {
    if (previous === null) root.removeAttribute("dir");
    else root.setAttribute("dir", previous);
  }
}

function RtlMenu({ align }: { align?: "left" | "right" }) {
  return (
    <Host>
      <div style={{ display: "flex" }}>
        <DropdownMenu
          align={align}
          trigger={<Button>Actions</Button>}
          items={[{ id: "a", label: "Edit something" }]}
        />
      </div>
    </Host>
  );
}

async function openRtlMenu() {
  const body = within(document.body);
  const trigger = await body.findByRole("button", { name: "Actions" });
  await userEvent.click(trigger);
  return { trigger, menu: await body.findByRole("menu") };
}

/** In RTL `align="left"` is the inline start, so the menu shares the trigger's right edge. */
export const DropdownMenuStartAlignsToTriggerInRtl: Story = {
  render: () => <RtlMenu />,
  play: async () => {
    await inRtl(async () => {
      const { trigger, menu } = await openRtlMenu();
      await waitFor(() =>
        expect(menu.getBoundingClientRect().right).toBeCloseTo(
          trigger.getBoundingClientRect().right,
          0
        )
      );
      expectInViewport(menu);
      // Grows leftwards from the trigger: the non-floating CSS uses the same origin.
      const origin = parseFloat(getComputedStyle(menu).transformOrigin);
      expect(origin).toBeGreaterThan(menu.getBoundingClientRect().width / 2);
    });
  },
};

/** In RTL `align="right"` is the inline end, so the menu shares the trigger's left edge. */
export const DropdownMenuEndAlignsToTriggerInRtl: Story = {
  render: () => <RtlMenu align="right" />,
  play: async () => {
    await inRtl(async () => {
      const { trigger, menu } = await openRtlMenu();
      await waitFor(() =>
        expect(menu.getBoundingClientRect().left).toBeCloseTo(
          trigger.getBoundingClientRect().left,
          0
        )
      );
      expectInViewport(menu);
      const origin = parseFloat(getComputedStyle(menu).transformOrigin);
      expect(origin).toBeLessThan(menu.getBoundingClientRect().width / 2);
    });
  },
};

const toppings = Array.from({ length: 8 }, (_, i) => ({
  value: `t${i}`,
  label: `Quite a long topping name ${i}`,
}));

export const MultiComboboxListFollowsWrappingChips: Story = {
  render: () => (
    <Host>
      <Combobox label="Toppings" multiple options={toppings} />
    </Host>
  ),
  play: async () => {
    const body = within(document.body);
    const input = await body.findByRole("combobox");
    const control = input.parentElement!;
    await userEvent.click(input);
    await userEvent.click((await body.findAllByRole("option"))[0]!);
    const oneChipHeight = control.getBoundingClientRect().height;
    for (let i = 1; i < 6; i++) {
      await userEvent.click((await body.findAllByRole("option"))[i]!);
    }
    // Precondition: the chips wrapped onto a second row, so the control grew
    // under the open list.
    expect(control.getBoundingClientRect().height).toBeGreaterThan(oneChipHeight);
    await waitFor(() => {
      const list = body.getByRole("listbox").getBoundingClientRect();
      const field = control.getBoundingClientRect();
      expect(list.top >= field.bottom - 0.5 || list.bottom <= field.top + 0.5).toBe(true);
    });
  },
};

/**
 * The control grows with nothing else stirring (no scroll, no list change): its
 * container narrows, the chips wrap, and the open list has to follow the
 * control's new bottom edge.
 */
export const ComboboxListFollowsControlResize: Story = {
  render: () => (
    <Host>
      <div data-testid="field" style={{ width: 400 }}>
        <Combobox
          label="Toppings"
          multiple
          options={toppings}
          values={["t0", "t1", "t2"]}
          onValuesChange={() => {}}
        />
      </div>
    </Host>
  ),
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const input = await body.findByRole("combobox");
    const control = input.parentElement!;
    await userEvent.click(input);
    await body.findByRole("listbox");
    const before = control.getBoundingClientRect().height;
    const field = canvasElement.ownerDocument.querySelector("[data-testid=field]") as HTMLElement;
    field.style.width = "160px";
    await waitFor(() => expect(control.getBoundingClientRect().height).toBeGreaterThan(before));
    await waitFor(() => {
      const list = body.getByRole("listbox").getBoundingClientRect();
      const box = control.getBoundingClientRect();
      expect(list.top >= box.bottom - 0.5 || list.bottom <= box.top + 0.5).toBe(true);
    });
  },
};

/** A trigger pinned to a viewport edge, so the panel has to be clamped to fit. */
function EdgePopover({
  placement,
  edge,
}: {
  placement: "left" | "right" | "top" | "bottom";
  edge: "left" | "right";
}) {
  return (
    <Host>
      <div style={{ position: "fixed", top: 300, [edge]: 4 }}>
        <Popover trigger={<Button>Edge</Button>} placement={placement} title="Edge">
          <p>Content that is wide enough to need real room on either side.</p>
        </Popover>
      </div>
    </Host>
  );
}

async function expectEdgePanelInViewport() {
  const body = within(document.body);
  const trigger = await body.findByRole("button", { name: "Edge" });
  // While the dialog animates in, its transform makes it the containing block of
  // `position: fixed`; wait until the trigger really sits at a viewport edge.
  await waitFor(() => {
    const box = trigger.getBoundingClientRect();
    expect(box.left < 16 || box.right > document.documentElement.clientWidth - 16).toBe(true);
  });
  await userEvent.click(trigger);
  const panel = await body.findByRole("dialog", { name: "Edge" });
  await waitFor(() => expectInViewport(panel));
}

export const PopoverLeftPlacementClampsAtLeftEdge: Story = {
  render: () => <EdgePopover placement="left" edge="left" />,
  play: expectEdgePanelInViewport,
};

export const PopoverRightPlacementClampsAtRightEdge: Story = {
  render: () => <EdgePopover placement="right" edge="right" />,
  play: expectEdgePanelInViewport,
};
