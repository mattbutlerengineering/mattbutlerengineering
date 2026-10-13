import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Dialog } from "../components/Dialog/Dialog";
import { Drawer } from "../components/Drawer/Drawer";
import { Popover } from "../components/Popover/Popover";

describe("overlay stack: one Escape closes only the top layer", () => {
  it("Dialog opened over a Drawer: only the Dialog closes", () => {
    const closeDrawer = vi.fn();
    const closeDialog = vi.fn();
    render(
      <>
        <Drawer open onClose={closeDrawer} title="Drawer">
          <button>in drawer</button>
        </Drawer>
        <Dialog open onClose={closeDialog} title="Dialog">
          <button>in dialog</button>
        </Dialog>
      </>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeDialog).toHaveBeenCalledTimes(1);
    expect(closeDrawer).not.toHaveBeenCalled();
  });

  it("Popover open inside a Dialog: only the Popover closes", () => {
    const closeDialog = vi.fn();
    const onOpenChange = vi.fn();
    // The Popover opens after the Dialog (as in real use), so it sits on top.
    const tree = (popoverOpen: boolean) => (
      <Dialog open onClose={closeDialog} title="Dialog">
        <Popover
          trigger={<button>pop</button>}
          open={popoverOpen}
          onOpenChange={onOpenChange}
          title="Pop"
        >
          <p>body</p>
        </Popover>
      </Dialog>
    );
    const { rerender } = render(tree(false));
    rerender(tree(true));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(closeDialog).not.toHaveBeenCalled();
  });

  it("after the top layer closes, Escape reaches the layer beneath", () => {
    const closeDrawer = vi.fn();
    const closeDialog = vi.fn();
    const tree = (dialogOpen: boolean) => (
      <>
        <Drawer open onClose={closeDrawer} title="Drawer">
          <button>x</button>
        </Drawer>
        <Dialog open={dialogOpen} onClose={closeDialog} title="Dialog">
          <button>y</button>
        </Dialog>
      </>
    );
    const { rerender } = render(tree(true));
    rerender(tree(false));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeDrawer).toHaveBeenCalledTimes(1);
    expect(closeDialog).not.toHaveBeenCalled();
  });

  it("an overlay reopened later sits above one that stayed open", () => {
    const closeDrawer = vi.fn();
    const closeDialog = vi.fn();
    const tree = (dialogOpen: boolean) => (
      <>
        <Dialog open={dialogOpen} onClose={closeDialog} title="Dialog">
          <button>y</button>
        </Dialog>
        <Drawer open onClose={closeDrawer} title="Drawer">
          <button>x</button>
        </Drawer>
      </>
    );
    const { rerender } = render(tree(false));
    rerender(tree(true));
    expect(screen.getByText("y")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeDialog).toHaveBeenCalledTimes(1);
    expect(closeDrawer).not.toHaveBeenCalled();
  });
});
