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
  });
});
