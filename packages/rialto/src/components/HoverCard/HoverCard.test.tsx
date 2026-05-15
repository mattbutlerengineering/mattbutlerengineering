import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { HoverCard } from "./HoverCard";

describe("HoverCard", () => {
  describe("rendering", () => {
    it("renders the trigger child", () => {
      render(
        <HoverCard content={<p>Preview content</p>}>
          <button>Hover me</button>
        </HoverCard>
      );
      expect(screen.getByRole("button", { name: "Hover me" })).toBeInTheDocument();
    });

    it("does not show card by default", () => {
      render(
        <HoverCard content={<p>Preview content</p>}>
          <button>Hover me</button>
        </HoverCard>
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("shows card after focus (scheduleOpen fires via onFocus)", async () => {
      render(
        <HoverCard content={<p>Preview content</p>} openDelay={0}>
          <button>Hover me</button>
        </HoverCard>
      );
      const trigger = screen.getByRole("button", { name: "Hover me" });
      // onFocus schedules open with openDelay=0
      fireEvent.focus(trigger);
      await waitFor(
        () => expect(screen.getByRole("dialog")).toBeInTheDocument(),
        { timeout: 500 }
      );
      expect(screen.getByText("Preview content")).toBeInTheDocument();
    });

    it("hides card after blur (scheduleClose fires via onBlur)", async () => {
      render(
        <HoverCard content={<p>Preview content</p>} openDelay={0} closeDelay={0}>
          <button>Hover me</button>
        </HoverCard>
      );
      const trigger = screen.getByRole("button", { name: "Hover me" });
      fireEvent.focus(trigger);
      await waitFor(
        () => expect(screen.getByRole("dialog")).toBeInTheDocument(),
        { timeout: 500 }
      );

      fireEvent.blur(trigger);
      await waitFor(
        () => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
        { timeout: 500 }
      );
    });
  });

  describe("keyboard interactions", () => {
    it("closes on Escape key when open", async () => {
      const user = userEvent.setup();
      render(
        <HoverCard content={<p>Preview content</p>} openDelay={0}>
          <button>Hover me</button>
        </HoverCard>
      );
      const trigger = screen.getByRole("button", { name: "Hover me" });
      fireEvent.focus(trigger);
      await waitFor(
        () => expect(screen.getByRole("dialog")).toBeInTheDocument(),
        { timeout: 500 }
      );

      await user.keyboard("{Escape}");
      await waitFor(
        () => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
        { timeout: 500 }
      );
    });
  });

  describe("placement", () => {
    it("renders with placement=top after focus", async () => {
      render(
        <HoverCard content={<p>Top preview</p>} placement="top" openDelay={0}>
          <button>Hover me</button>
        </HoverCard>
      );
      fireEvent.focus(screen.getByRole("button"));
      await waitFor(
        () => expect(screen.getByRole("dialog")).toBeInTheDocument(),
        { timeout: 500 }
      );
    });

    it("renders with placement=bottom after focus", async () => {
      render(
        <HoverCard content={<p>Bottom preview</p>} placement="bottom" openDelay={0}>
          <button>Hover me</button>
        </HoverCard>
      );
      fireEvent.focus(screen.getByRole("button"));
      await waitFor(
        () => expect(screen.getByRole("dialog")).toBeInTheDocument(),
        { timeout: 500 }
      );
    });
  });

  describe("accessibility", () => {
    it("passes axe when closed", async () => {
      const { container } = render(
        <HoverCard content={<p>Preview</p>}>
          <button>Hover me</button>
        </HoverCard>
      );
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });

    it("passes axe when open", async () => {
      const { container } = render(
        <HoverCard content={<p>Preview content</p>} openDelay={0}>
          <button>Hover me</button>
        </HoverCard>
      );
      fireEvent.focus(screen.getByRole("button"));
      await waitFor(
        () => expect(screen.getByRole("dialog")).toBeInTheDocument(),
        { timeout: 500 }
      );
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});
