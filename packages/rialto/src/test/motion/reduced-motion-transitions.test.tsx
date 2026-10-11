/**
 * Reduced motion lands in one frame — at the rendered transition, not the source
 *
 * ADR-025: under `prefers-reduced-motion` every motion config collapses to an
 * instant transition. Six overlay/presence components used to hand-build a
 * `{ duration: 0.1 }` fallback instead — still travelling, just faster — and
 * read the preference from framer's `useReducedMotion` rather than the one
 * signal `useMotionPreset()` resolves.
 *
 * This file asserts the *behaviour*: with the OS preference set, the motion
 * element that presents each component's content carries a zero-duration
 * transition, recorded by `test/record-motion.ts` at the rendered interface.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Popover } from "../../components/Popover/Popover";
import { DropdownMenu } from "../../components/DropdownMenu/DropdownMenu";
import { ContextMenu } from "../../components/ContextMenu/ContextMenu";
import { HoverCard } from "../../components/HoverCard/HoverCard";
import { ToastAnimated } from "../../components/Toast/ToastAnimated";
import { AnimatedTag } from "../../components/Tag/Tag";

import { PREFERS_REDUCED_MOTION, stubMatchMedia } from "../match-media";

vi.mock("framer-motion", async () => (await import("../record-motion")).recordingFramerMotion());

// The OS-level preference — what `useDeviceContext()` (and so
// `useMotionPreset()`) reads. Set before any component subscribes.
stubMatchMedia([PREFERS_REDUCED_MOTION]);

/** The transition on the motion element that presents `text` (its nearest motion ancestor). */
function presentingTransition(text: string): unknown {
  const el = screen.getByText(text).closest("[data-motion-transition]");
  expect(el).not.toBeNull();
  return JSON.parse(el?.getAttribute("data-motion-transition") ?? "null") as unknown;
}

const INSTANT = { duration: 0 };

describe("reduced motion — overlay and presence transitions are instant", () => {
  it("Popover", async () => {
    const user = userEvent.setup();
    render(
      <Popover trigger={<button>Open</button>} title="Info">
        Body
      </Popover>
    );
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(presentingTransition("Body")).toEqual(INSTANT);
  });

  it("DropdownMenu", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu
        trigger={<button>Menu</button>}
        items={[{ id: "edit", label: "Edit", onSelect: vi.fn() }]}
      />
    );
    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(presentingTransition("Edit")).toEqual(INSTANT);
  });

  it("ContextMenu", () => {
    render(
      <ContextMenu items={[{ id: "copy", label: "Copy", onSelect: vi.fn() }]}>
        <div>Target</div>
      </ContextMenu>
    );
    fireEvent.contextMenu(screen.getByText("Target"));
    expect(presentingTransition("Copy")).toEqual(INSTANT);
  });

  it("HoverCard", async () => {
    render(
      <HoverCard content={<p>Preview</p>} openDelay={0}>
        <a href="https://example.com">Hover me</a>
      </HoverCard>
    );
    fireEvent.mouseEnter(screen.getByText("Hover me").closest("[class]") as HTMLElement);
    await waitFor(() => expect(screen.getByText("Preview")).toBeInTheDocument());
    expect(presentingTransition("Preview")).toEqual(INSTANT);
  });

  it("ToastAnimated", () => {
    render(<ToastAnimated toasts={[{ id: "t1", title: "Saved" }]} onDismiss={vi.fn()} />);
    expect(presentingTransition("Saved")).toEqual(INSTANT);
  });

  it("AnimatedTag", () => {
    render(<AnimatedTag id="tag-1">Alpha</AnimatedTag>);
    expect(presentingTransition("Alpha")).toEqual(INSTANT);
  });
});
