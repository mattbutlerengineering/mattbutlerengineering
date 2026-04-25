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
        onConfirm={noop}
        onCancel={noop}
      >
        This action cannot be undone.
      </ConfirmDialog>
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
          { label: "Profile", onClick: noop },
          { label: "Settings", onClick: noop },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("HoverCard", async () => {
    const { container } = render(
      <HoverCard trigger={<button>Hover me</button>}>
        <p>Card content</p>
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
      <Tooltip label="Save changes">
        <button>Save</button>
      </Tooltip>
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
