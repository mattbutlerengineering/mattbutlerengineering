/**
 * Standalone Render Guard — HUD components without a RialtoProvider
 *
 * Rialto publishes to a registry, and consumers drop a single component into
 * their own tree with no provider above it. `useMotionPreset()` is built to
 * survive that (ADR-025), but the components that call it are where the
 * contract is actually observable: if the hook ever grew a throwing
 * dependency, these renders are what would go red — long before an external
 * consumer found out for us.
 */

import { render, screen } from "@testing-library/react";
import { Meter } from "../../components/Meter/Meter";
import { Progress } from "../../components/Progress/Progress";
import { Odometer } from "../../components/Odometer/Odometer";
import { Card } from "../../components/Card/Card";

const HUD_COMPONENTS = [
  ["Meter", <Meter key="meter" value={42} label="Load" />, "meter"],
  ["Progress", <Progress key="progress" value={42} aria-label="Sync" />, "progressbar"],
  ["Odometer", <Odometer key="odometer" value={1234} locale="en-US" />, "status"],
  ["Card", <Card key="card" title="Zone 3" tilt />, "heading"],
] as const;

describe("HUD components with no provider", () => {
  it.each(HUD_COMPONENTS)("%s renders standalone", (_name, element, role) => {
    render(element);

    expect(screen.getByRole(role)).toBeInTheDocument();
  });
});
