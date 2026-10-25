import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { formatLocalTime } from "../../utils/format.js";
import { RehearsalBanner } from "./RehearsalBanner.js";
import type { RehearsalPlayback } from "./use-rehearsal-playback.js";

/** The banner wired to a playback clock, with the simulated time of day in the venue's locale. */
export function RehearsalPlaybackBanner({ playback }: { playback: RehearsalPlayback }) {
  const fmt = useVenueFormat();
  const minute = Math.floor(playback.time);
  const clock = formatLocalTime(
    `${Math.floor(minute / 60) % 24}:${String(minute % 60).padStart(2, "0")}`,
    fmt.locale
  );
  return (
    <RehearsalBanner
      clock={clock}
      playing={playback.playing}
      speed={playback.speed}
      reducedMotion={playback.reducedMotion}
      onPlay={playback.play}
      onPause={playback.pause}
      onStep={playback.step}
      onSpeedChange={playback.setSpeed}
    />
  );
}
