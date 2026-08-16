/**
 * Standalone Render Guard — HUD components in a jsdom with no `matchMedia`
 *
 * jsdom does not implement `matchMedia`; suites that need it stub it in setup.
 * This file deliberately removes it, because a consumer's suite may never have
 * added it. `useMotionPreset()` reads the device signal through
 * `useDeviceContext`, which subscribes to media queries — so a component that
 * needs the stub is a component that cannot be dropped into an arbitrary test
 * environment.
 *
 * It lives in its own file on purpose: `useDeviceContext` caches its
 * `MediaQueryList` handles in module state, so any earlier render in the same
 * file would satisfy the cache and the deletion would go unnoticed. A fresh
 * module registry is the only way this assertion means anything.
 *
 * Found by CI, not by review: `packages/rialto-catalog`'s suite renders `Card`
 * without the stub, and went red with `TypeError: window.matchMedia is not a
 * function` the moment `useTilt` started resolving its spring through the
 * preset hook.
 */

import { render, screen } from "@testing-library/react";
import { Meter } from "../../components/Meter/Meter";
import { Progress } from "../../components/Progress/Progress";
import { Odometer } from "../../components/Odometer/Odometer";
import { Card } from "../../components/Card/Card";

const original = window.matchMedia;

beforeAll(() => {
  // @ts-expect-error — removing a DOM API is the situation under test.
  delete window.matchMedia;
});

afterAll(() => {
  window.matchMedia = original;
});

describe("HUD components with no matchMedia", () => {
  it.each([
    ["Meter", <Meter key="meter" value={42} label="Load" />, "meter"],
    ["Progress", <Progress key="progress" value={42} aria-label="Sync" />, "progressbar"],
    ["Odometer", <Odometer key="odometer" value={1234} locale="en-US" />, "status"],
    ["Card", <Card key="card" title="Zone 3" tilt />, "heading"],
  ] as const)("%s renders without matchMedia", (_name, element, role) => {
    render(element);

    expect(screen.getByRole(role)).toBeInTheDocument();
  });
});
