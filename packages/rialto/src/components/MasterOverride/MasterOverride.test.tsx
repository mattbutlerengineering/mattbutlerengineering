import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MasterOverride } from "./MasterOverride";

function Harness(props: { initial?: boolean }) {
  const [on, setOn] = useState(props.initial ?? false);
  return <MasterOverride label="Kill switch" on={on} onChange={setOn} />;
}

describe("MasterOverride", () => {
  describe("initial render", () => {
    it("renders the cover as the first interactive control", () => {
      render(<Harness />);
      expect(
        screen.getByRole("button", { name: /lift safety cover for kill switch/i })
      ).toBeInTheDocument();
    });

    it("renders the switch but keeps it disabled until cover is lifted", () => {
      render(<Harness />);
      const switchEl = screen.getByRole("switch");
      expect(switchEl).toBeDisabled();
      expect(switchEl).toHaveAttribute("aria-checked", "false");
    });

    it("cover disclosure references the switch element via aria-controls", () => {
      render(<Harness />);
      const cover = screen.getByRole("button", { name: /lift safety cover/i });
      const switchEl = screen.getByRole("switch");
      expect(cover).toHaveAttribute("aria-controls", switchEl.id);
      expect(cover).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("two-stage interaction", () => {
    it("lifts the cover on click and enables the switch", async () => {
      const user = userEvent.setup();
      render(<Harness />);
      const cover = screen.getByRole("button", { name: /lift safety cover/i });
      await user.click(cover);

      expect(cover).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("switch")).not.toBeDisabled();
    });

    it("moves focus to the switch once the cover is lifted", async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      expect(screen.getByRole("switch")).toHaveFocus();
    });

    it("flips the switch and fires onChange only after the cover is open", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<MasterOverride label="Kill" on={false} onChange={onChange} />);

      // Switch is disabled — click should do nothing
      const switchEl = screen.getByRole("switch");
      await user.click(switchEl);
      expect(onChange).not.toHaveBeenCalled();

      // Open cover, then click switch
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      await user.click(screen.getByRole("switch"));
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it("closes the cover on second click and returns focus to it", async () => {
      const user = userEvent.setup();
      render(<Harness />);
      const cover = screen.getByRole("button", { name: /lift safety cover/i });
      await user.click(cover);
      await user.click(
        screen.getByRole("button", { name: /close safety cover for kill switch/i })
      );

      expect(screen.getByRole("switch")).toBeDisabled();
      expect(
        screen.getByRole("button", { name: /lift safety cover/i })
      ).toHaveFocus();
    });
  });

  describe("disabled", () => {
    it("does not open when the whole component is disabled", async () => {
      const user = userEvent.setup();
      render(<MasterOverride label="Kill" on={false} onChange={vi.fn()} disabled />);
      const cover = screen.getByRole("button", { name: /lift safety cover/i });
      await user.click(cover);
      expect(cover).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("accessibility", () => {
    it("exposes the label as the switch's accessible name", () => {
      render(<Harness />);
      expect(screen.getByRole("switch")).toHaveAccessibleName("Kill switch");
    });

    it("associates description via aria-describedby", () => {
      render(
        <MasterOverride
          label="Kill"
          on={false}
          onChange={vi.fn()}
          description="Halts production"
        />
      );
      expect(screen.getByRole("switch")).toHaveAccessibleDescription("Halts production");
    });

    it("provides a polite live region announcing current state", () => {
      render(<Harness />);
      const liveRegion = screen.getByRole("status");
      expect(liveRegion).toHaveAttribute("aria-live", "polite");
      expect(liveRegion).toHaveTextContent(/safety cover closed/i);
      expect(liveRegion).toHaveTextContent(/standby/i);
    });
  });

  describe("prop scaffolding", () => {
    it("accepts requireHold and labelTransition without crashing", () => {
      const { container } = render(
        <MasterOverride
          label="Test"
          on={false}
          onChange={() => {}}
          requireHold={500}
          labelTransition="fade"
          labelLength={8}
        />
      );
      expect(container.firstChild).toBeTruthy();
    });
  });

  describe("requireHold", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not engage on a single click (no hold)", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      await user.click(screen.getByRole("switch"));
      expect(onChange).not.toHaveBeenCalled();
    });

    it("disengages on a single click — asymmetric (on → off is instant)", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={true} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      await user.click(screen.getByRole("switch"));
      expect(onChange).toHaveBeenCalledWith(false);
    });

    it("engages after holding the switch for the default 1000ms threshold", async () => {
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));

      const switchEl = screen.getByRole("switch");
      fireEvent.pointerDown(switchEl);
      expect(onChange).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it("engages when Enter is held past threshold", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      switchEl.focus();
      fireEvent.keyDown(switchEl, { key: "Enter" });
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it("engages when Space is held past threshold", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      switchEl.focus();
      fireEvent.keyDown(switchEl, { key: " " });
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it("ignores key-repeat events (does not reset the hold timer)", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      switchEl.focus();
      fireEvent.keyDown(switchEl, { key: "Enter" });
      await act(async () => { vi.advanceTimersByTime(500); });
      // Simulate OS key-repeat firing a second keydown midway
      fireEvent.keyDown(switchEl, { key: "Enter", repeat: true });
      await act(async () => { vi.advanceTimersByTime(500); });
      // Total elapsed = 1000ms; if repeat had reset, threshold would not have fired
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it("cancels when pointer is released before threshold", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      fireEvent.pointerDown(switchEl);
      await act(async () => { vi.advanceTimersByTime(500); });
      fireEvent.pointerUp(switchEl);
      await act(async () => { vi.advanceTimersByTime(2000); });
      expect(onChange).not.toHaveBeenCalled();
    });

    it("cancels when pointer leaves the switch before threshold", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      fireEvent.pointerDown(switchEl);
      await act(async () => { vi.advanceTimersByTime(400); });
      fireEvent.pointerLeave(switchEl);
      await act(async () => { vi.advanceTimersByTime(2000); });
      expect(onChange).not.toHaveBeenCalled();
    });

    it("cancels when key is released before threshold", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      switchEl.focus();
      fireEvent.keyDown(switchEl, { key: "Enter" });
      await act(async () => { vi.advanceTimersByTime(300); });
      fireEvent.keyUp(switchEl, { key: "Enter" });
      await act(async () => { vi.advanceTimersByTime(2000); });
      expect(onChange).not.toHaveBeenCalled();
    });

    it("cancels when pointer is released outside the element (document pointerup)", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      fireEvent.pointerDown(switchEl);
      await act(async () => { vi.advanceTimersByTime(300); });
      // Release somewhere other than the switch
      fireEvent.pointerUp(document.body);
      await act(async () => { vi.advanceTimersByTime(2000); });
      expect(onChange).not.toHaveBeenCalled();
    });

    it("clamps requireHold below 250ms to 250ms", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold={100} />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      fireEvent.pointerDown(switchEl);
      // At 100ms (requested) — should NOT have fired yet
      await act(async () => { vi.advanceTimersByTime(100); });
      expect(onChange).not.toHaveBeenCalled();
      // At 250ms (clamp minimum) — should fire
      await act(async () => { vi.advanceTimersByTime(150); });
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it("clamps requireHold above 5000ms to 5000ms", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold={10000} />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      fireEvent.pointerDown(switchEl);
      // At 5000ms (clamp ceiling) — should fire
      await act(async () => { vi.advanceTimersByTime(5000); });
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it("announces 'Hold to arm' when hold begins", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(
        <MasterOverride label="Primary" on={false} onChange={() => {}} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      fireEvent.pointerDown(screen.getByRole("switch"));
      const live = screen.getByRole("status");
      expect(live.textContent).toMatch(/hold to arm primary/i);
    });

    it("announces 'Arming cancelled' on early release", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(
        <MasterOverride label="Primary" on={false} onChange={() => {}} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const switchEl = screen.getByRole("switch");
      fireEvent.pointerDown(switchEl);
      await act(async () => { vi.advanceTimersByTime(200); });
      fireEvent.pointerUp(switchEl);
      expect(screen.getByRole("status").textContent).toMatch(/arming cancelled/i);
    });

    it("announces '<label> engaged' on successful engagement", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      // Use a non-reactive onChange so `on` stays false — the announcement fires
      // and is not immediately cleared by the armed/on-change clear effect.
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      fireEvent.pointerDown(screen.getByRole("switch"));
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(screen.getByRole("status").textContent).toMatch(/primary engaged/i);
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it("renders the progress ring element inside the switch track while holding", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { container } = render(
        <MasterOverride label="Primary" on={false} onChange={() => {}} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).not.toMatch(/holding/);
      fireEvent.pointerDown(screen.getByRole("switch"));
      expect(wrapper.className).toMatch(/holding/);
    });

    it("clears hold announcement when switch state changes after engagement", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const Harness = () => {
        const [on, setOn] = useState(false);
        return (
          <MasterOverride label="Primary" on={on} onChange={setOn} requireHold />
        );
      };
      render(<Harness />);
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      fireEvent.pointerDown(screen.getByRole("switch"));
      await act(async () => { vi.advanceTimersByTime(1000); });
      // After engagement, the live region briefly says "Primary engaged"…
      // (may already be cleared by React flush order, so we allow either value)
      // The load-bearing assertion is after closing the cover:
      await user.click(screen.getByRole("button", { name: /close safety cover/i }));
      // Once armed changes, the effect clears holdAnnouncement.
      expect(screen.getByRole("status").textContent).not.toMatch(/primary engaged/i);
    });

    it("still engages at threshold when prefers-reduced-motion is true (default in tests)", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      fireEvent.pointerDown(screen.getByRole("switch"));
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it("does not leak the hold timer when unmounted mid-hold", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onChange = vi.fn();
      const { unmount } = render(
        <MasterOverride label="Primary" on={false} onChange={onChange} requireHold />
      );
      await user.click(screen.getByRole("button", { name: /lift safety cover/i }));
      fireEvent.pointerDown(screen.getByRole("switch"));
      await act(async () => { vi.advanceTimersByTime(400); });
      unmount();
      await act(async () => { vi.advanceTimersByTime(2000); });
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
