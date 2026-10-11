/**
 * HUD motion follows the vibe — asserted at the rendered transition
 *
 * ADR-025: motion configs resolve through `useMotionPreset()` so a vibe can
 * retime them. A component holding an imported static keeps default timing
 * under every vibe — invisible to typecheck and to every render test that
 * does not look at the transition, because the wrong config animates fine.
 *
 * Replaces the source-grep guard `hud-motion-source.test.ts`: instead of
 * checking that a file *mentions* `useMotionPreset`, this renders each HUD
 * component under the game vibe and asserts the transition it hands
 * framer-motion is the game preset's — the behaviour the grep stood in for.
 * (SplitFlap/DepartureBoard stay prop-timed by `flipInterval`/`holdMs`; their
 * own suites cover that caller contract.)
 */

import type { ReactNode } from "react";
import { render, renderHook } from "@testing-library/react";
import { useSpring } from "framer-motion";

import { RialtoProvider } from "../../providers/RialtoProvider";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { precision, springGentle, springTilt } from "../../tokens/motion";
import { Meter } from "../../components/Meter/Meter";
import { Progress } from "../../components/Progress/Progress";
import { Odometer } from "../../components/Odometer/Odometer";
import { useTilt } from "../../hooks/useTilt";
import { stubMatchMedia } from "../match-media";
import { recordedTransitions } from "../record-motion";

vi.mock("framer-motion", async () => (await import("../record-motion")).recordingFramerMotion());

// Full motion — under reduced motion every preset is instant, vibe or not.
stubMatchMedia([]);

function Game({ children }: { children: ReactNode }) {
  return <RialtoProvider vibe="game">{children}</RialtoProvider>;
}

const game = renderHook(() => useMotionPreset(), { wrapper: Game }).result.current;

describe("HUD motion follows the game vibe", () => {
  it("Meter fills with the game precision transition", () => {
    const { container } = render(<Meter value={40} label="Load" />, { wrapper: Game });
    expect(recordedTransitions(container)).toContainEqual(game.precision);
    expect(recordedTransitions(container)).not.toContainEqual(precision);
  });

  it("Progress fills with the game precision transition", () => {
    const { container } = render(<Progress value={40} label="Upload" />, { wrapper: Game });
    expect(recordedTransitions(container)).toContainEqual(game.precision);
    expect(recordedTransitions(container)).not.toContainEqual(precision);
  });

  it("Odometer settles with the game springGentle transition", () => {
    const { container } = render(<Odometer value={1234} locale="en-US" />, { wrapper: Game });
    expect(recordedTransitions(container)).toContainEqual(game.springGentle);
    expect(recordedTransitions(container)).not.toContainEqual(springGentle);
  });

  it("useTilt springs with the game tilt config", () => {
    vi.mocked(useSpring).mockClear();
    renderHook(() => useTilt(true), { wrapper: Game });
    const configs = vi.mocked(useSpring).mock.calls.map((call) => call[1]);
    expect(configs).toContainEqual(game.tilt);
    expect(configs).not.toContainEqual(springTilt);
  });
});
