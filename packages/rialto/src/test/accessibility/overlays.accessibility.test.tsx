import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";

/* ── Components ─────────────────────────────── */
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { Dialog } from "../../components/Dialog/Dialog";
import { Drawer } from "../../components/Drawer/Drawer";
import { DropdownMenu } from "../../components/DropdownMenu/DropdownMenu";
import { HoverCard } from "../../components/HoverCard/HoverCard";
import { Popover } from "../../components/Popover/Popover";
import { ToastProvider } from "../../components/Toast/Toast";
import { Tooltip } from "../../components/Tooltip/Tooltip";

const noop = () => {};

describe("Accessibility — Overlay Components", () => {
  it("ConfirmDialog", async () => {
    const { container } = render(
      <ConfirmDialog
        open
        title="Are you sure?"
        description="This action cannot be undone."
        onConfirm={noop}
        onCancel={noop}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Dialog (open)", async () => {
    const { container } = render(
      <Dialog open onClose={noop} title="Test Dialog">
        <p>Dialog content</p>
      </Dialog>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Drawer (open)", async () => {
    const { container } = render(
      <Drawer open onClose={noop} title="Menu">
        <p>Drawer content</p>
      </Drawer>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("DropdownMenu", async () => {
    const { container } = render(
      <DropdownMenu
        trigger={<button>Menu</button>}
        items={[
          { id: "profile", label: "Profile", onSelect: noop },
          { id: "settings", label: "Settings", onSelect: noop },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("HoverCard", async () => {
    const { container } = render(
      <HoverCard content={<p>Card content</p>}>
        <button>Hover me</button>
      </HoverCard>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Popover", async () => {
    const { container } = render(
      <Popover trigger={<button>Open</button>}>
        <p>Popover content</p>
      </Popover>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Toast", async () => {
    const { container } = render(
      <ToastProvider>
        <div>Content</div>
      </ToastProvider>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Tooltip", async () => {
    const { container } = render(
      <Tooltip content="Save changes">
        <button>Save</button>
      </Tooltip>
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
