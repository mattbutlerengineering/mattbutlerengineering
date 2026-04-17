import { render, screen, act, waitFor } from "@testing-library/react";
import { SplitScreenExit } from "./SplitScreenExit";

describe("SplitScreenExit", () => {
  describe("idle state", () => {
    it("renders children normally when inactive", () => {
      render(
        <SplitScreenExit active={false}>
          <button>Sign in</button>
        </SplitScreenExit>
      );
      expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    });

    it("renders children exactly once when inactive (not duplicated)", () => {
      render(
        <SplitScreenExit active={false}>
          <button>Sign in</button>
        </SplitScreenExit>
      );
      expect(screen.getAllByRole("button", { name: "Sign in" })).toHaveLength(1);
    });
  });

  describe("active state", () => {
    it("hides both exit halves from AT", () => {
      const { container } = render(
        <SplitScreenExit active={true}>
          <div>content</div>
        </SplitScreenExit>
      );
      const halves = container.querySelectorAll('[aria-hidden="true"]');
      expect(halves.length).toBeGreaterThanOrEqual(2);
    });

    it("announces the transition via a polite live region", () => {
      render(
        <SplitScreenExit active={true} announcement="Signing you in">
          <div>form</div>
        </SplitScreenExit>
      );
      const status = screen.getByRole("status");
      expect(status).toHaveAttribute("aria-live", "polite");
      expect(status).toHaveTextContent("Signing you in");
    });

    it("omits the live region when no announcement provided", () => {
      render(
        <SplitScreenExit active={true}>
          <div>form</div>
        </SplitScreenExit>
      );
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  describe("onExitComplete", () => {
    it("does not fire while active is false", () => {
      const onExitComplete = vi.fn();
      render(
        <SplitScreenExit active={false} onExitComplete={onExitComplete}>
          <div>form</div>
        </SplitScreenExit>
      );
      expect(onExitComplete).not.toHaveBeenCalled();
    });

    // Note: framer-motion's animation complete is async and JSDOM-unfriendly;
    // we verify the callback contract indirectly via reduced-motion path below.
  });

  describe("reduced motion", () => {
    beforeEach(() => {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (query: string) => ({
          matches: query.includes("reduce"),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => true,
          onchange: null,
        }),
      });
    });

    it("fires onExitComplete immediately on next tick under reduced motion", async () => {
      const onExitComplete = vi.fn();
      render(
        <SplitScreenExit active={true} onExitComplete={onExitComplete}>
          <div>form</div>
        </SplitScreenExit>
      );

      await waitFor(() => {
        expect(onExitComplete).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("re-entry", () => {
    it("allows toggling active false → true → false without firing twice", async () => {
      const onExitComplete = vi.fn();
      const { rerender } = render(
        <SplitScreenExit active={false} onExitComplete={onExitComplete}>
          <div>form</div>
        </SplitScreenExit>
      );

      act(() => {
        rerender(
          <SplitScreenExit active={true} onExitComplete={onExitComplete}>
            <div>form</div>
          </SplitScreenExit>
        );
      });

      // Reduced-motion mode from beforeEach above fires once
      await waitFor(() => {
        expect(onExitComplete).toHaveBeenCalledTimes(1);
      });

      // Re-arming after a flip back to false should NOT fire again without active
      act(() => {
        rerender(
          <SplitScreenExit active={false} onExitComplete={onExitComplete}>
            <div>form</div>
          </SplitScreenExit>
        );
      });
      expect(onExitComplete).toHaveBeenCalledTimes(1);
    });
  });
});
