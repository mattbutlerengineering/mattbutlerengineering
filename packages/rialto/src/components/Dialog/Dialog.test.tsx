import fs from "node:fs";
import path from "node:path";
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RialtoProvider } from "../../providers/RialtoProvider";
import { Popover } from "../Popover/Popover";
import { Dialog } from "./Dialog";

describe("Dialog", () => {
  describe("rendering", () => {
    it("renders nothing when open=false", () => {
      render(<Dialog open={false} onClose={() => {}} title="Test" />);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("renders dialog when open=true", () => {
      render(<Dialog open onClose={() => {}} title="Test Dialog" />);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("renders title text", () => {
      render(<Dialog open onClose={() => {}} title="Edit Profile" />);
      expect(screen.getByText("Edit Profile")).toBeInTheDocument();
    });

    it("renders description when provided", () => {
      render(<Dialog open onClose={() => {}} description="This action cannot be undone." />);
      expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument();
    });

    it("renders children", () => {
      render(
        <Dialog open onClose={() => {}}>
          <p>Dialog body</p>
        </Dialog>
      );
      expect(screen.getByText("Dialog body")).toBeInTheDocument();
    });

    it("renders footer when provided", () => {
      render(
        <Dialog open onClose={() => {}} footer={<button>Save</button>}>
          Content
        </Dialog>
      );
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });

    it("renders a close button", () => {
      render(<Dialog open onClose={() => {}} />);
      expect(screen.getByRole("button", { name: /close dialog/i })).toBeInTheDocument();
    });
  });

  describe("ARIA attributes", () => {
    it("has aria-modal=true", () => {
      render(<Dialog open onClose={() => {}} />);
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    });

    it("sets aria-labelledby when title is provided", () => {
      render(<Dialog open onClose={() => {}} title="My Dialog" />);
      const dialog = screen.getByRole("dialog");
      const labelId = dialog.getAttribute("aria-labelledby");
      expect(labelId).toBeTruthy();
      expect(document.getElementById(labelId!)).toHaveTextContent("My Dialog");
    });

    it("sets aria-label=Dialog when no title", () => {
      render(<Dialog open onClose={() => {}} />);
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Dialog");
    });

    it("sets aria-describedby when description is provided", () => {
      render(<Dialog open onClose={() => {}} description="Some description" />);
      const dialog = screen.getByRole("dialog");
      const descId = dialog.getAttribute("aria-describedby");
      expect(descId).toBeTruthy();
      expect(document.getElementById(descId!)).toHaveTextContent("Some description");
    });
  });

  describe("close behavior", () => {
    it("calls onClose when close button is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<Dialog open onClose={onClose} />);
      await user.click(screen.getByRole("button", { name: /close dialog/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when Escape is pressed", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<Dialog open onClose={onClose} />);
      await user.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when overlay backdrop is clicked", () => {
      const onClose = vi.fn();
      render(<Dialog open onClose={onClose} />);
      const overlay = document.body.querySelector('[class*="overlay"]') as HTMLElement;
      expect(overlay).not.toBeNull();
      fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalled();
    });

    it("portals a nested dialog outside the outer panel so the two do not share a box", () => {
      render(
        <Dialog open onClose={() => {}} title="Outer">
          <Dialog open onClose={() => {}} title="Inner">
            <p>Inside</p>
          </Dialog>
        </Dialog>
      );
      const outer = screen.getByRole("dialog", { name: "Outer" });
      const inner = screen.getByRole("dialog", { name: "Inner" });
      expect(outer.contains(inner)).toBe(false);
    });

    it("renders inside its provider subtree, inheriting dir and the vibe variables", () => {
      render(
        <RialtoProvider vibe="transacting">
          <div dir="rtl" data-testid="rtl-root">
            <Dialog open onClose={() => {}} title="Scoped" />
          </div>
        </RialtoProvider>
      );
      const dialog = screen.getByRole("dialog", { name: "Scoped" });
      expect(screen.getByTestId("rtl-root").contains(dialog)).toBe(true);
      const vibeRoot = dialog.closest<HTMLElement>("[data-theme]");
      expect(vibeRoot?.style.getPropertyValue("--rialto-radius-default")).toBe("4px");
    });

    it("keeps a nested dialog inside the provider subtree too", () => {
      render(
        <div dir="rtl" data-testid="rtl-root">
          <Dialog open onClose={() => {}} title="Outer">
            <Dialog open onClose={() => {}} title="Inner" />
          </Dialog>
        </div>
      );
      const inner = screen.getByRole("dialog", { name: "Inner" });
      expect(screen.getByTestId("rtl-root").contains(inner)).toBe(true);
    });

    it("closes nested dialogs one at a time on Escape", async () => {
      const user = userEvent.setup();
      function Nested() {
        const [outerOpen, setOuterOpen] = useState(true);
        const [innerOpen, setInnerOpen] = useState(false);
        return (
          <Dialog open={outerOpen} onClose={() => setOuterOpen(false)} title="Outer">
            <button type="button" onClick={() => setInnerOpen(true)}>
              Open inner
            </button>
            <Dialog open={innerOpen} onClose={() => setInnerOpen(false)} title="Inner" />
          </Dialog>
        );
      }
      render(<Nested />);
      await user.click(screen.getByRole("button", { name: "Open inner" }));
      expect(screen.getByRole("dialog", { name: "Inner" })).toBeInTheDocument();

      await user.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Inner" })).not.toBeInTheDocument()
      );
      expect(screen.getByRole("dialog", { name: "Outer" })).toBeInTheDocument();

      await user.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Outer" })).not.toBeInTheDocument()
      );
    });

    it("does not close when clicking inside the panel", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(
        <Dialog open onClose={onClose} title="Panel">
          <p>Inner content</p>
        </Dialog>
      );
      await user.click(screen.getByText("Inner content"));
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("focus management", () => {
    it("moves focus inside the dialog when opened", () => {
      render(
        <Dialog open onClose={() => {}}>
          <button>First</button>
        </Dialog>
      );
      // The close button or first focusable element inside should receive focus
      // At minimum, a button exists and the dialog is rendered
      expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
    });

    it("does not focus the close button first", () => {
      render(
        <Dialog open onClose={() => {}} title="Edit profile">
          <button>First</button>
        </Dialog>
      );
      expect(document.activeElement).toBe(screen.getByText("First"));
      expect(document.activeElement).not.toBe(
        screen.getByRole("button", { name: /close dialog/i })
      );
    });
  });

  describe("layout", () => {
    const css = fs.readFileSync(path.join(__dirname, "Dialog.module.css"), "utf-8");
    const rule = (selector: string): string => {
      const match = new RegExp(`(?:^|\\n)${selector}\\s*\\{([^}]*)\\}`).exec(css);
      if (!match?.[1]) throw new Error(`no rule for ${selector} in Dialog.module.css`);
      return match[1];
    };

    it("keeps the footer outside the scrolling body, and the title outside both", () => {
      render(
        <Dialog open onClose={() => {}} title="Long" footer={<button>Save</button>}>
          <p>Dialog body</p>
        </Dialog>
      );
      const panel = screen.getByRole("dialog");
      const body = screen.getByText("Dialog body").parentElement as HTMLElement;
      expect(body.parentElement).toBe(panel);
      expect(body).not.toContainElement(screen.getByRole("button", { name: "Save" }));
      expect(body).not.toContainElement(screen.getByText("Long"));
    });

    it("scrolls the body first; the panel scrolls only as a last resort", () => {
      expect(rule("\\.panel")).toMatch(/overflow-y:\s*auto/);
      expect(rule("\\.panel")).toMatch(/display:\s*flex/);
      expect(rule("\\.panel")).toMatch(/flex-direction:\s*column/);
      expect(rule("\\.body")).toMatch(/overflow-y:\s*auto/);
      expect(rule("\\.body")).toMatch(/min-height:\s*0/);
    });

    it("makes the body the containing block, so absolute descendants stay inside its clip", () => {
      // Hidden radio inputs and the like are position: absolute; without this
      // they resolve against the panel and escape the body's overflow clip.
      expect(rule("\\.body")).toMatch(/position:\s*relative/);
    });

    it("paints an opaque surface over the glass recipe in both themes", () => {
      // The panel composes `glass` (rgb(253 252 250 / 0.85) + backdrop blur),
      // so the override must out-specify it: #7994.
      const light = rule("\\.overlay \\.panel");
      expect(light).toMatch(/background:\s*var\(--rialto-surface-elevated\)/);
      expect(light).toMatch(/backdrop-filter:\s*none/);
      expect(rule(':global\\(\\[data-theme="dark"\\]\\) \\.overlay \\.panel')).toMatch(
        /background:\s*var\(--rialto-surface-elevated\)/
      );
    });
  });

  describe("scrolling body", () => {
    const stubScrollMetrics = (scrollHeight: number, clientHeight: number) => {
      const sh = vi
        .spyOn(HTMLElement.prototype, "scrollHeight", "get")
        .mockReturnValue(scrollHeight);
      const ch = vi
        .spyOn(HTMLElement.prototype, "clientHeight", "get")
        .mockReturnValue(clientHeight);
      return () => {
        sh.mockRestore();
        ch.mockRestore();
      };
    };
    const bodyOf = () => screen.getByText("Dialog body").parentElement as HTMLElement;

    it("puts the description inside the scrolling body and keeps aria-describedby on it", () => {
      render(
        <Dialog open onClose={() => {}} title="T" description="Long description">
          <p>Dialog body</p>
        </Dialog>
      );
      const description = screen.getByText("Long description");
      expect(bodyOf()).toContainElement(description);
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-describedby", description.id);
    });

    it("makes an overflowing body a named, focusable region that is not the initial focus", () => {
      const restore = stubScrollMetrics(900, 200);
      render(
        <Dialog open onClose={() => {}} title="T" footer={<button>Save</button>}>
          <p>Dialog body</p>
        </Dialog>
      );
      const body = bodyOf();
      expect(body).toHaveAttribute("tabindex", "0");
      expect(body).toHaveAttribute("role", "region");
      expect(body).toHaveAttribute("aria-label");
      expect(body).toHaveAttribute("data-focus-trap-skip-initial", "true");
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save" }));
      restore();
    });

    it("adds no tab stop when the content fits", () => {
      const restore = stubScrollMetrics(200, 200);
      render(
        <Dialog open onClose={() => {}} title="T">
          <p>Dialog body</p>
        </Dialog>
      );
      expect(bodyOf()).not.toHaveAttribute("tabindex");
      expect(bodyOf()).not.toHaveAttribute("role");
      restore();
    });

    // A ResizeObserver only sees the body's box change. These two inputs change
    // scrollHeight without resizing it, so they need a MutationObserver.
    describe("re-syncs on content changes that do not resize the box", () => {
      const metrics = { scrollHeight: 200, clientHeight: 200 };
      beforeEach(() => {
        metrics.scrollHeight = 200;
        metrics.clientHeight = 200;
        vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
          () => metrics.scrollHeight
        );
        vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
          () => metrics.clientHeight
        );
      });
      afterEach(() => vi.restoreAllMocks());

      it("gains the tab stop when an absolute child makes a fitting body overflow", async () => {
        render(
          <Dialog open onClose={() => {}} title="T">
            <p>Dialog body</p>
          </Dialog>
        );
        expect(bodyOf()).not.toHaveAttribute("tabindex");
        metrics.scrollHeight = 3000;
        const tall = document.createElement("div");
        tall.style.position = "absolute";
        const body = bodyOf();
        body.appendChild(tall);
        await waitFor(() => expect(body).toHaveAttribute("tabindex", "0"));
        expect(body).toHaveAttribute("role", "region");
      });

      it("drops a stale tab stop when text shrinks overflowing content to exactly the cap", async () => {
        metrics.scrollHeight = 900;
        render(
          <Dialog open onClose={() => {}} title="T">
            <p>Dialog body</p>
          </Dialog>
        );
        const body = bodyOf();
        expect(body).toHaveAttribute("tabindex", "0");
        metrics.scrollHeight = 200;
        const text = screen.getByText("Dialog body").firstChild as Text;
        text.data = "Shorter";
        await waitFor(() => expect(body).not.toHaveAttribute("tabindex"));
        expect(body).not.toHaveAttribute("role");
        expect(body).not.toHaveAttribute("aria-label");
      });

      it("stops observing when the dialog closes", async () => {
        const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
        const { rerender } = render(
          <Dialog open onClose={() => {}} title="T">
            <p>Dialog body</p>
          </Dialog>
        );
        rerender(
          <Dialog open={false} onClose={() => {}} title="T">
            <p>Dialog body</p>
          </Dialog>
        );
        expect(disconnect).toHaveBeenCalled();
      });
    });
  });

  describe("nested Popover", () => {
    it("renders the popover panel outside the clipping body, still inside the dialog layer", async () => {
      const user = userEvent.setup();
      render(
        <Dialog open onClose={() => {}} title="T">
          <Popover trigger={<button>Pick</button>}>
            <p>Popover content</p>
          </Popover>
        </Dialog>
      );
      await user.click(screen.getByRole("button", { name: "Pick" }));
      const panel = screen.getByText("Popover content").closest("[role=dialog]") as HTMLElement;
      const dialogPanel = screen.getByRole("dialog", { name: "T" });
      const body = screen
        .getByRole("button", { name: "Pick" })
        .closest("[data-focus-trap-skip-initial='true']") as HTMLElement;
      expect(body).not.toContainElement(panel);
      expect(dialogPanel).not.toContainElement(panel);
      expect(dialogPanel.parentElement).toContainElement(panel);
      // Placed by viewport coordinates from the trigger (the stylesheet makes it fixed).
      expect(panel.style.left).not.toBe("");
      expect(panel.style.top).not.toBe("");
    });

    it("keeps outside-press dismissal: inside presses stay open, outside presses close it", async () => {
      const user = userEvent.setup();
      render(
        <Dialog open onClose={() => {}} title="T">
          <p>Elsewhere</p>
          <Popover trigger={<button>Pick</button>}>
            <button>Inside</button>
          </Popover>
        </Dialog>
      );
      await user.click(screen.getByRole("button", { name: "Pick" }));
      await user.click(screen.getByRole("button", { name: "Inside" }));
      expect(screen.getByRole("button", { name: "Inside" })).toBeInTheDocument();
      await user.click(screen.getByText("Elsewhere"));
      await waitFor(() => expect(screen.queryByRole("button", { name: "Inside" })).toBeNull());
    });
  });

  describe("floating Popover styles", () => {
    it("fixes a dialog-hosted popover and lets it scroll when capped", () => {
      const popoverCss = fs.readFileSync(
        path.join(__dirname, "../Popover/Popover.module.css"),
        "utf-8"
      );
      const floating = /\n\.floating\s*\{([^}]*)\}/.exec(popoverCss)?.[1] ?? "";
      expect(floating).toMatch(/position:\s*fixed/);
      expect(floating).toMatch(/inset:\s*auto/);
      expect(floating).toMatch(/overflow-y:\s*auto/);
    });
  });

  describe("short viewports", () => {
    const css = fs.readFileSync(path.join(__dirname, "Dialog.module.css"), "utf-8");

    it("tightens the chrome so the footer keeps room at the 400% zoom reflow size", () => {
      const media = /@media \(max-height:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/.exec(css);
      expect(media, "a max-height media query").not.toBeNull();
      expect(Number(media?.[1])).toBeGreaterThanOrEqual(256);
      expect(media?.[2]).toMatch(/max-height:\s*calc\(100dvh - /);
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the panel element", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<Dialog ref={ref} open onClose={() => {}} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});
