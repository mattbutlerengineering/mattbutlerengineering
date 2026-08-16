/**
 * Telemetry HUD — `/demos/telemetry`
 *
 * The one thing to do on this page is flip the vibe and watch the same screen
 * change character. Everything else exists to give that flip something to act
 * on: four regions, four density registers, four component families.
 *
 * `?frozen=1` pins the feed to a single frame so screenshots are byte-stable.
 */

import { useSearchParams } from "react-router";
import { EventTicker, StatusStrip, VitalsRail, ZoneTable } from "./regions";
import { useTelemetryFeed } from "./useTelemetryFeed";
import styles from "./Telemetry.module.css";

/** Fixed so the session replays identically on every visit. */
const SESSION_SEED = 1337;

export function Telemetry() {
  const [searchParams] = useSearchParams();
  const frozen = searchParams.get("frozen") === "1";

  const feed = useTelemetryFeed({ seed: SESSION_SEED, frozen });
  const frame = feed.kind === "connecting" || feed.kind === "empty" ? null : feed.frame;

  return (
    <div className={styles.page}>
      <div className={styles.hud} data-feed-state={feed.kind}>
        <StatusStrip feed={feed} frame={frame} />
        <div className={styles.body}>
          <ZoneTable frame={frame} />
          <VitalsRail frame={frame} />
        </div>
        <EventTicker frame={frame} frozen={frozen} />
      </div>
    </div>
  );
}

Telemetry.displayName = "Telemetry";
