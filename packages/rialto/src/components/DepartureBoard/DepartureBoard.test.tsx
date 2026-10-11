import { createRef } from "react";
import { render, screen, act } from "@testing-library/react";
import { DepartureBoard } from "./DepartureBoard";
import { PREFERS_REDUCED_MOTION, setMatchingMedia, stubMatchMedia } from "../../test/match-media";

// Full motion by default — the global setup is reduced — so the flipping path
// runs; reduced-motion tests flip the device signal useMotionPreset() reads.
stubMatchMedia([]);

const PHRASES = ["MAKE IT REAL", "SHIP THE FUTURE", "BUILD BOLDLY"];

describe("DepartureBoard", () => {
  beforeEach(() => {
    setMatchingMedia([]);
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("rendering", () => {
    it("forwards its ref to the root element", () => {
      const ref = createRef<HTMLDivElement>();
      render(<DepartureBoard ref={ref} phrases={PHRASES} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });

    it("composes SplitFlap to render the board glyphs", () => {
      const { container } = render(<DepartureBoard phrases={PHRASES} />);
      // SplitFlap renders role="img"; querySelector ignores the aria-hidden wrapper.
      expect(container.querySelector('[role="img"]')).not.toBeNull();
    });

    it("passes through the accessible html attributes to the root", () => {
      render(<DepartureBoard phrases={PHRASES} data-testid="board" />);
      expect(screen.getByTestId("board")).toBeInTheDocument();
    });
  });

  describe("accessibility — animated path", () => {
    it("exposes the current phrase to assistive tech via a polite live region", () => {
      render(<DepartureBoard phrases={PHRASES} />);
      const live = screen.getByRole("status");
      expect(live).toHaveTextContent(PHRASES[0]!);
    });

    it("hides the decorative flap glyphs from assistive tech", () => {
      const { container } = render(<DepartureBoard phrases={PHRASES} />);
      const board = container.querySelector('[role="img"]');
      expect(board?.closest('[aria-hidden="true"]')).not.toBeNull();
    });
  });

  describe("cycling — animated path", () => {
    it("advances to the next phrase after holdMs elapses", () => {
      vi.useFakeTimers();
      render(<DepartureBoard phrases={PHRASES} holdMs={1000} />);
      expect(screen.getByRole("status")).toHaveTextContent(PHRASES[0]!);

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByRole("status")).toHaveTextContent(PHRASES[1]!);

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByRole("status")).toHaveTextContent(PHRASES[2]!);
    });

    it("wraps back to the first phrase after the last", () => {
      vi.useFakeTimers();
      render(<DepartureBoard phrases={PHRASES} holdMs={1000} />);
      act(() => {
        vi.advanceTimersByTime(1000 * PHRASES.length);
      });
      expect(screen.getByRole("status")).toHaveTextContent(PHRASES[0]!);
    });

    it("honours a custom holdMs — no advance before the interval elapses", () => {
      vi.useFakeTimers();
      render(<DepartureBoard phrases={PHRASES} holdMs={5000} />);
      act(() => {
        vi.advanceTimersByTime(4999);
      });
      expect(screen.getByRole("status")).toHaveTextContent(PHRASES[0]!);
    });

    it("does not cycle a single-phrase board", () => {
      vi.useFakeTimers();
      render(<DepartureBoard phrases={["ONLY ONE"]} holdMs={1000} />);
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByRole("status")).toHaveTextContent("ONLY ONE");
    });
  });

  describe("reduced motion", () => {
    it("renders the current phrase as readable static text", () => {
      setMatchingMedia([PREFERS_REDUCED_MOTION]);
      render(<DepartureBoard phrases={PHRASES} />);
      expect(screen.getByText(PHRASES[0]!)).toBeInTheDocument();
    });

    it("does not render the flipping flap glyphs", () => {
      setMatchingMedia([PREFERS_REDUCED_MOTION]);
      const { container } = render(<DepartureBoard phrases={PHRASES} />);
      expect(container.querySelector('[role="img"]')).toBeNull();
    });

    it("does not auto-advance through phrases", () => {
      setMatchingMedia([PREFERS_REDUCED_MOTION]);
      vi.useFakeTimers();
      render(<DepartureBoard phrases={PHRASES} holdMs={1000} />);
      act(() => {
        vi.advanceTimersByTime(1000 * (PHRASES.length + 2));
      });
      expect(screen.getByText(PHRASES[0]!)).toBeInTheDocument();
      expect(screen.queryByText(PHRASES[1]!)).toBeNull();
    });
  });
});
