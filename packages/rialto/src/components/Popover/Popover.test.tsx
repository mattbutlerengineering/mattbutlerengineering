/**
 * Unit tests for the Popover component.
 */
import { beforeAll, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Popover } from "./Popover";
import { Button } from "../Button/Button";
import { Select } from "../Select/Select";

const user = userEvent.setup();

describe("Popover", () => {
  it("does not show content by default", () => {
    render(
      <Popover trigger={<Button>Open</Button>}>
        <p>Popover content</p>
      </Popover>
    );
    expect(screen.queryByText("Popover content")).not.toBeInTheDocument();
  });

  it("shows content when trigger is clicked", async () => {
    render(
      <Popover trigger={<Button>Open</Button>}>
        <p>Popover content</p>
      </Popover>
    );
    await user.click(screen.getByRole("button", { name: /open/i }));
    expect(screen.getByText("Popover content")).toBeInTheDocument();
  });

  it("closes when trigger is clicked again", async () => {
    render(
      <Popover trigger={<Button>Toggle</Button>}>
        <p>Content</p>
      </Popover>
    );
    const btn = screen.getByRole("button", { name: /toggle/i });
    await user.click(btn);
    expect(screen.getByText("Content")).toBeInTheDocument();
    await user.click(btn);
    await waitFor(() => expect(screen.queryByText("Content")).not.toBeInTheDocument());
  });

  it("closes on Escape key", async () => {
    render(
      <Popover trigger={<Button>Open</Button>}>
        <p>Content</p>
      </Popover>
    );
    await user.click(screen.getByRole("button", { name: /open/i }));
    expect(screen.getByText("Content")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Content")).not.toBeInTheDocument());
  });

  it("closes when clicking outside the popover", async () => {
    render(
      <div>
        <Popover trigger={<Button>Open</Button>}>
          <p>Content</p>
        </Popover>
        <p>Outside element</p>
      </div>
    );
    await user.click(screen.getByRole("button", { name: /open/i }));
    expect(screen.getByText("Content")).toBeInTheDocument();
    await user.click(screen.getByText("Outside element"));
    await waitFor(() => expect(screen.queryByText("Content")).not.toBeInTheDocument());
  });

  it("renders title in header when provided", async () => {
    render(
      <Popover trigger={<Button>Open</Button>} title="Filter Options">
        <p>Content</p>
      </Popover>
    );
    await user.click(screen.getByRole("button", { name: /open/i }));
    expect(screen.getByText("Filter Options")).toBeInTheDocument();
  });

  it("renders close button when title is provided", async () => {
    render(
      <Popover trigger={<Button>Open</Button>} title="Options">
        <p>Content</p>
      </Popover>
    );
    await user.click(screen.getByRole("button", { name: /open/i }));
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("closes via header close button", async () => {
    render(
      <Popover trigger={<Button>Open</Button>} title="Options">
        <p>Content</p>
      </Popover>
    );
    await user.click(screen.getByRole("button", { name: /open/i }));
    await user.click(screen.getByRole("button", { name: /close/i }));
    await waitFor(() => expect(screen.queryByText("Content")).not.toBeInTheDocument());
  });

  it("has role=dialog when open", async () => {
    render(
      <Popover trigger={<Button>Open</Button>} title="My Popover">
        <p>Content</p>
      </Popover>
    );
    await user.click(screen.getByRole("button", { name: /open/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("sets aria-expanded on trigger", async () => {
    render(
      <Popover trigger={<Button>Open</Button>}>
        <p>Content</p>
      </Popover>
    );
    const btn = screen.getByRole("button", { name: /open/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("sets aria-haspopup=dialog on trigger", () => {
    render(
      <Popover trigger={<Button>Open</Button>}>
        <p>Content</p>
      </Popover>
    );
    expect(screen.getByRole("button", { name: /open/i })).toHaveAttribute(
      "aria-haspopup",
      "dialog"
    );
  });

  it("sets aria-controls on trigger pointing at the panel id, before and after open", async () => {
    render(
      <Popover trigger={<Button>Open</Button>}>
        <p>Content</p>
      </Popover>
    );
    const btn = screen.getByRole("button", { name: /open/i });
    const controlsId = btn.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();

    await user.click(btn);
    expect(btn).toHaveAttribute("aria-controls", controlsId as string);
    expect(screen.getByRole("dialog")).toHaveAttribute("id", controlsId as string);
  });

  it("sets aria-modal on the panel", async () => {
    render(
      <Popover trigger={<Button>Open</Button>} title="My Popover">
        <p>Content</p>
      </Popover>
    );
    await user.click(screen.getByRole("button", { name: /open/i }));
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("traps focus inside the panel (Tab wraps from last to first focusable element)", async () => {
    render(
      <Popover trigger={<Button>Open</Button>} title="Options">
        <button type="button">Action</button>
      </Popover>
    );
    await user.click(screen.getByRole("button", { name: /open/i }));

    const closeBtn = screen.getByRole("button", { name: /close/i });
    const actionBtn = screen.getByRole("button", { name: /action/i });

    actionBtn.focus();
    expect(document.activeElement).toBe(actionBtn);

    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: false,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(tabEvent);

    expect(tabEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(closeBtn);
  });

  it("supports different placement values", async () => {
    const { rerender } = render(
      <Popover trigger={<Button>Open</Button>} placement="top">
        <p>Content</p>
      </Popover>
    );
    await user.click(screen.getByRole("button", { name: /open/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    rerender(
      <Popover trigger={<Button>Open</Button>} placement="right">
        <p>Content</p>
      </Popover>
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  describe("controlled", () => {
    it("shows content when open is true", () => {
      render(
        <Popover open trigger={<Button>Open</Button>}>
          <p>Content</p>
        </Popover>
      );
      expect(screen.getByText("Content")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /open/i })).toHaveAttribute(
        "aria-expanded",
        "true"
      );
    });

    it("hides content when open is false", () => {
      render(
        <Popover open={false} trigger={<Button>Open</Button>}>
          <p>Content</p>
        </Popover>
      );
      expect(screen.queryByText("Content")).not.toBeInTheDocument();
    });

    it("calls onOpenChange(true) on trigger click without opening itself", async () => {
      const onOpenChange = vi.fn();
      render(
        <Popover open={false} onOpenChange={onOpenChange} trigger={<Button>Open</Button>}>
          <p>Content</p>
        </Popover>
      );
      await user.click(screen.getByRole("button", { name: /open/i }));
      expect(onOpenChange).toHaveBeenCalledWith(true);
      expect(screen.queryByText("Content")).not.toBeInTheDocument();
    });

    it("calls onOpenChange(false) on Escape and stays open until the parent updates", async () => {
      const onOpenChange = vi.fn();
      render(
        <Popover open onOpenChange={onOpenChange} trigger={<Button>Open</Button>}>
          <p>Content</p>
        </Popover>
      );
      await user.keyboard("{Escape}");
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(screen.getByText("Content")).toBeInTheDocument();
    });

    it("calls onOpenChange(false) on outside click", async () => {
      const onOpenChange = vi.fn();
      render(
        <div>
          <button type="button">Outside</button>
          <Popover open onOpenChange={onOpenChange} trigger={<Button>Open</Button>}>
            <p>Content</p>
          </Popover>
        </div>
      );
      await user.click(screen.getByRole("button", { name: "Outside" }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("calls onOpenChange in uncontrolled mode too", async () => {
      const onOpenChange = vi.fn();
      render(
        <Popover onOpenChange={onOpenChange} trigger={<Button>Open</Button>}>
          <p>Content</p>
        </Popover>
      );
      await user.click(screen.getByRole("button", { name: /open/i }));
      expect(onOpenChange).toHaveBeenCalledWith(true);
      expect(screen.getByText("Content")).toBeInTheDocument();
    });
  });

  describe("trigger wrapping (a11y iteration 3)", () => {
    it("calls the consumer's onClick when the trigger is activated by keyboard (Enter and Space)", async () => {
      const onClick = vi.fn();
      render(
        <Popover trigger={<Button onClick={onClick}>Open</Button>}>
          <p>Content</p>
        </Popover>
      );
      const btn = screen.getByRole("button", { name: "Open" });
      btn.focus();
      await user.keyboard("{Enter}");
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      btn.focus();
      await user.keyboard(" ");
      expect(onClick).toHaveBeenCalledTimes(2);
    });

    it("keeps the consumer's ref, onKeyDown and non-owned aria-* on the trigger", async () => {
      const ref = { current: null as HTMLButtonElement | null };
      const onKeyDown = vi.fn();
      render(
        <Popover
          trigger={
            <button ref={ref} onKeyDown={onKeyDown} aria-describedby="hint" aria-label="Filters">
              Open
            </button>
          }
        >
          <p>Content</p>
        </Popover>
      );
      const btn = screen.getByRole("button", { name: "Filters" });
      expect(ref.current).toBe(btn);
      expect(btn).toHaveAttribute("aria-describedby", "hint");
      btn.focus();
      await user.keyboard("{Enter}");
      expect(onKeyDown).toHaveBeenCalledTimes(1);
    });
  });
  describe("portaled descendants", () => {
    const options = [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
    ];

    beforeAll(() => {
      Element.prototype.scrollIntoView = vi.fn();
    });

    function Harness({ onChange }: { onChange: (value: string) => void }) {
      return (
        <Popover trigger={<Button>Open</Button>}>
          <Select aria-label="Pick" options={options} value="a" onChange={onChange} />
        </Popover>
      );
    }

    it("lets a mouse pick in a Select listbox portaled outside the panel", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);
      await user.click(screen.getByRole("button", { name: "Open" }));
      await user.click(screen.getByRole("combobox", { name: "Pick" }));
      await user.click(screen.getByRole("option", { name: "Beta" }));
      expect(onChange).toHaveBeenCalledWith("b");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("keeps the popover open when Enter commits a Select option", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);
      await user.click(screen.getByRole("button", { name: "Open" }));
      screen.getByRole("combobox", { name: "Pick" }).focus();
      await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
      expect(onChange).toHaveBeenCalledWith("b");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("still dismisses on a press outside both the panel and its portals", async () => {
      const user = userEvent.setup();
      render(
        <>
          <Harness onChange={vi.fn()} />
          <p>Elsewhere</p>
        </>
      );
      await user.click(screen.getByRole("button", { name: "Open" }));
      await user.click(screen.getByText("Elsewhere"));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
  });
});
