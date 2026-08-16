/**
 * Telemetry HUD — `/demos/telemetry`
 *
 * The one thing to do on this page is flip the vibe and watch the same screen
 * change character. Everything else exists to give that flip something to act
 * on: four regions, four density registers, four component families.
 *
 * `?frozen=1` pins the feed to a single frame so screenshots are byte-stable.
 */

import { useState } from "react";
import { useSearchParams } from "react-router";
import { RialtoProvider, useUIEnvironment, type VibeName } from "@mattbutlerengineering/rialto";
import { EventTicker, StatusStrip, VibeSwitch, VitalsRail, ZoneTable } from "./regions";
import { useTelemetryFeed } from "./useTelemetryFeed";
import styles from "./Telemetry.module.css";

/** Fixed so the session replays identically on every visit. */
const SESSION_SEED = 1337;

export function Telemetry() {
  const [searchParams] = useSearchParams();
  const frozen = searchParams.get("frozen") === "1";

  // The evaluator lands under the game vibe — flipping it back is the pitch.
  // Local state, so the choice dies with the route: no storage, no effect on
  // any other page, nothing to reset afterwards.
  const [vibe, setVibe] = useState<VibeName>("game");

  // Reconnecting returns to the primary flow, per `ux.md` — it does not
  // rewrite the URL, so a reload still reproduces the state it was asked for.
  const [reconnected, setReconnected] = useState(false);

  // Inherit the demo shell's resolved theme rather than re-resolving it. A
  // nested provider left on "system" would swap the HUD's tokens to the OS
  // scheme and fight the demo's own theme control.
  const { theme } = useUIEnvironment();

  // `?feed=` drops the HUD straight into a designed state. The evaluator can
  // walk the degraded flow without waiting for a failure that, with no network
  // behind this page, would never come.
  const forcedFeed = reconnected ? null : searchParams.get("feed");

  const feed = useTelemetryFeed({
    seed: SESSION_SEED,
    frozen,
    started: forcedFeed !== "empty",
    paused: forcedFeed === "hold",
    degraded: forcedFeed === "stale",
  });
  const frame = feed.kind === "connecting" || feed.kind === "empty" ? null : feed.frame;

  return (
    <RialtoProvider vibe={vibe} theme={theme}>
      <div className={styles.page}>
        <div
          className={styles.hud}
          data-feed-state={feed.kind}
          data-dimmed={feed.kind === "stale" ? "" : undefined}
        >
          <StatusStrip feed={feed} frame={frame} onReconnect={() => setReconnected(true)}>
            <VibeSwitch value={vibe} onChange={setVibe} />
          </StatusStrip>
          <div className={styles.body}>
            <ZoneTable frame={frame} kind={feed.kind} />
            <VitalsRail frame={frame} kind={feed.kind} />
          </div>
          <EventTicker frame={frame} frozen={frozen} />
        </div>
      </div>
    </RialtoProvider>
  );
}

Telemetry.displayName = "Telemetry";
