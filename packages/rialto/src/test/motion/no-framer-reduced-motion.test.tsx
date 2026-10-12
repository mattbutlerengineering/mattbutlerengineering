/**
 * Guard — no rialto source reads framer-motion's `useReducedMotion()`.
 *
 * ADR-025 makes `useMotionPreset().reduced` the single reduced-motion signal.
 * `test/setup.ts` turns framer's hook into a tripwire that throws, so any
 * component calling it fails the tests that render it. This file checks the
 * tripwire is armed, then renders the call sites #6279 migrated last — the
 * behaviour-gated ones (canvas/RAF loops, timers, CSS classes) — under both
 * device states, so a regression in any of them fails here by name.
 *
 * Rendering, not a source grep: the check is that the hook is never *called*,
 * which is what the guard is for, and it holds through re-exports and aliases
 * a text scan would miss.
 */

import { render, renderHook } from "@testing-library/react";
import { useReducedMotion } from "framer-motion";
import { Avatar } from "../../components/Avatar/Avatar";
import { DepartureBoard } from "../../components/DepartureBoard/DepartureBoard";
import { Ferrofluid } from "../../components/Ferrofluid/Ferrofluid";
import { Handshake } from "../../components/Handshake/Handshake";
import { NeonSign } from "../../components/NeonSign/NeonSign";
import { SilkFlow } from "../../components/SilkFlow/SilkFlow";
import { SplitFlap } from "../../components/SplitFlap/SplitFlap";
import { WatchLoader } from "../../components/WatchLoader/WatchLoader";
import { useBoop } from "../../hooks/useBoop";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import { PREFERS_REDUCED_MOTION, setMatchingMedia, stubMatchMedia } from "../match-media";

stubMatchMedia([PREFERS_REDUCED_MOTION]);

const RENDERS: ReadonlyArray<readonly [string, () => void]> = [
  ["Avatar", () => render(<Avatar src="/a.jpg" name="A" transition="splitflap" />)],
  ["DepartureBoard", () => render(<DepartureBoard phrases={["ONE", "TWO"]} />)],
  ["Ferrofluid", () => render(<Ferrofluid />)],
  ["Handshake", () => render(<Handshake aria-label="x" stations={["A", "B"]} />)],
  ["NeonSign", () => render(<NeonSign state="open" aria-label="x" />)],
  ["SilkFlow", () => render(<SilkFlow />)],
  ["SplitFlap", () => render(<SplitFlap value="AB" aria-label="x" />)],
  ["WatchLoader", () => render(<WatchLoader aria-label="x" />)],
  ["useBoop", () => renderHook(() => useBoop())],
  ["useScrollReveal", () => renderHook(() => useScrollReveal())],
];

describe("framer-motion useReducedMotion is banned (ADR-025)", () => {
  it("setup.ts arms the tripwire — calling framer's hook throws", () => {
    expect(() => useReducedMotion()).toThrow(/useMotionPreset\(\)\.reduced/);
  });

  describe.each([
    ["reduced", [PREFERS_REDUCED_MOTION]],
    ["full motion", []],
  ] as const)("under %s", (_label, matching) => {
    beforeEach(() => {
      setMatchingMedia(matching);
    });

    it.each(RENDERS)("%s renders without calling it", (_name, renderIt) => {
      expect(renderIt).not.toThrow();
    });
  });
});
