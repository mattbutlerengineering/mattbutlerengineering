import { useTranslation } from "react-i18next";
import { Button, Text } from "@mattbutlerengineering/rialto";
import type { RehearsalSpeed } from "./use-rehearsal-playback.js";
import styles from "./RehearsalBanner.module.css";

const SPEEDS: readonly RehearsalSpeed[] = [15, 60, 240];

export interface RehearsalBannerProps {
  /** The simulated time of day, already formatted for the venue's locale. */
  clock: string;
  playing: boolean;
  speed: RehearsalSpeed;
  reducedMotion: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStep: () => void;
  onSpeedChange: (speed: RehearsalSpeed) => void;
}

/**
 * The one thing that keeps simulated data from being mistaken for a live service: always shown
 * in rehearsal mode, with the minimal playback controls. Under reduced motion the clock only
 * moves by event, so Play is replaced by Next event.
 */
export function RehearsalBanner({
  clock,
  playing,
  speed,
  reducedMotion,
  onPlay,
  onPause,
  onStep,
  onSpeedChange,
}: RehearsalBannerProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.banner} role="status" data-testid="rehearsal-banner">
      <Text as="span" variant="label" className={styles.title}>
        {t("rehearsal.banner.title")}
      </Text>
      <Text as="span" className={styles.clock}>
        {clock}
      </Text>
      <div className={styles.controls}>
        {reducedMotion ? (
          <Button variant="secondary" size="sm" onClick={onStep}>
            {t("rehearsal.banner.step")}
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={playing ? onPause : onPlay}>
            {playing ? t("rehearsal.banner.pause") : t("rehearsal.banner.play")}
          </Button>
        )}
        {!reducedMotion &&
          SPEEDS.map((s) => (
            <Button
              key={s}
              variant="ghost"
              size="sm"
              aria-pressed={s === speed}
              onClick={() => onSpeedChange(s)}
            >
              {t("rehearsal.banner.speed", { speed: s })}
            </Button>
          ))}
      </div>
    </div>
  );
}
