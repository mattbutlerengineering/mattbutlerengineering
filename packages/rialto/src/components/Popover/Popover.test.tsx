/**
 * Unit tests for the Popover component.
 */
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Popover } from "./Popover";
import { Button } from "../Button/Button";

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
});
