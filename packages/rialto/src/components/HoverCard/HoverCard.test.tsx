import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { HoverCard } from "./HoverCard";

describe("HoverCard", () => {
  describe("rendering", () => {
    it("renders the trigger child", () => {
      render(
        <HoverCard content={<p>Preview content</p>}>
          <a href="https://example.com">Hover me</a>
        </HoverCard>
      );
      expect(screen.getByText("Hover me")).toBeInTheDocument();
    });

    it("does not show card content by default", () => {
      render(
        <HoverCard content={<p>Preview content</p>}>
          <a href="https://example.com">Hover me</a>
        </HoverCard>
      );
      expect(screen.queryByText("Preview content")).not.toBeInTheDocument();
    });
  });

  describe("open/close behavior", () => {
    it("shows card content after mouseenter (with delay=0)", async () => {
      render(
        <HoverCard content={<p>Preview content</p>} openDelay={0}>
          <a href="https://example.com">Hover me</a>
        </HoverCard>
      );
      const wrapper = screen.getByText("Hover me").closest("[class]") as HTMLElement;
      fireEvent.mouseEnter(wrapper);
      await waitFor(() => expect(screen.getByText("Preview content")).toBeInTheDocument());
    });

    it("hides card content after mouseleave (with delay=0)", async () => {
      render(
        <HoverCard content={<p>Preview content</p>} openDelay={0} closeDelay={0}>
          <a href="https://example.com">Hover me</a>
        </HoverCard>
      );
      const wrapper = screen.getByText("Hover me").closest("[class]") as HTMLElement;
      fireEvent.mouseEnter(wrapper);
      await waitFor(() => expect(screen.getByText("Preview content")).toBeInTheDocument());
      fireEvent.mouseLeave(wrapper);
      await waitFor(() => expect(screen.queryByText("Preview content")).not.toBeInTheDocument());
    });

    it("closes on Escape key when open", async () => {
      const user = userEvent.setup();
      render(
        <HoverCard content={<p>Preview content</p>} openDelay={0}>
          <a href="https://example.com">Hover me</a>
        </HoverCard>
      );
      const wrapper = screen.getByText("Hover me").closest("[class]") as HTMLElement;
      fireEvent.mouseEnter(wrapper);
      await waitFor(() => expect(screen.getByText("Preview content")).toBeInTheDocument());
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByText("Preview content")).not.toBeInTheDocument());
    });
  });

  describe("card content", () => {
    it("renders rich content inside the card", async () => {
      render(
        <HoverCard
          openDelay={0}
          content={
            <div>
              <img src="/avatar.png" alt="User avatar" />
              <p>Jane Doe</p>
            </div>
          }
        >
          <span>Jane</span>
        </HoverCard>
      );
      const wrapper = screen.getByText("Jane").closest("[class]") as HTMLElement;
      fireEvent.mouseEnter(wrapper);
      await waitFor(() => {
        expect(screen.getByText("Jane Doe")).toBeInTheDocument();
        expect(screen.getByAltText("User avatar")).toBeInTheDocument();
      });
    });

    it("card has role=dialog when open", async () => {
      render(
        <HoverCard content={<p>Info</p>} openDelay={0}>
          <span>Trigger</span>
        </HoverCard>
      );
      const wrapper = screen.getByText("Trigger").closest("[class]") as HTMLElement;
      fireEvent.mouseEnter(wrapper);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    });
  });

  describe("placement", () => {
    it("renders with bottom placement (no error)", async () => {
      render(
        <HoverCard content={<p>Content</p>} openDelay={0} placement="bottom">
          <span>Trigger</span>
        </HoverCard>
      );
      const wrapper = screen.getByText("Trigger").closest("[class]") as HTMLElement;
      fireEvent.mouseEnter(wrapper);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    });

    it("renders with top placement", async () => {
      render(
        <HoverCard content={<p>Content</p>} openDelay={0} placement="top">
          <span>Trigger</span>
        </HoverCard>
      );
      const wrapper = screen.getByText("Trigger").closest("[class]") as HTMLElement;
      fireEvent.mouseEnter(wrapper);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the wrapper div", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(
        <HoverCard ref={ref} content={<p>Info</p>}>
          <span>Trigger</span>
        </HoverCard>
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("accessibility", () => {
    it("has no a11y violations when closed", async () => {
      const { container } = render(
        <HoverCard content={<p>User info preview</p>}>
          <a href="https://example.com">Jane Doe</a>
        </HoverCard>
      );
      expect(
        await axe(container, { rules: { "color-contrast": { enabled: false } } })
      ).toHaveNoViolations();
    });
  });
});
