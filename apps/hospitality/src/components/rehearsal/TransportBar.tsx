import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button, IconButton, SegmentedControl, Slider, Text } from "@mattbutlerengineering/rialto";
import type { PlaybackSpeed } from "./should-announce";
import { PauseIcon, PlayIcon } from "./transport-icons";
import styles from "./TransportBar.module.css";

const ONE_HOUR = 60;

export interface TransportBarProps {
  minute: number;
  openMinute: number;
  closeMinute: number;
  playing: boolean;
  speed: PlaybackSpeed;
  atEnd: boolean;
  reducedMotion: boolean;
  formatMinute: (minute: number) => string;
  onPlay: () => void;
  onPause: () => void;
  onSpeed: (speed: PlaybackSpeed) => void;
  onScrub: (minute: number) => void;
  onScrubRelease: () => void;
  onStep: (direction: 1 | -1) => void;
  onReplay: () => void;
  /** Present only when the curtain call was closed at the end of the night. */
  onShowCurtain?: () => void;
}

export function TransportBar({
  minute,
  openMinute,
  closeMinute,
  playing,
  speed,
  atEnd,
  reducedMotion,
  formatMinute,
  onPlay,
  onPause,
  onSpeed,
  onScrub,
  onScrubRelease,
  onStep,
  onReplay,
  onShowCurtain,
}: TransportBarProps) {
  const { t } = useTranslation();

  // Left and Right on the scrubber move one event, Shift one hour (ux.md Flow 5).
  const handleScrubKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    if (event.shiftKey) {
      onScrub(minute + direction * ONE_HOUR);
      onScrubRelease();
    } else {
      onStep(direction);
    }
  };

  const playPause = atEnd ? (
    <Button variant="primary" onClick={onReplay}>
      {t("rehearsal.transport.replay")}
    </Button>
  ) : reducedMotion ? (
    <Button variant="secondary" onClick={playing ? onPause : onPlay}>
      {playing ? t("rehearsal.transport.pause") : t("rehearsal.transport.play")}
    </Button>
  ) : (
    <IconButton
      variant="secondary"
      icon={playing ? <PauseIcon /> : <PlayIcon />}
      aria-label={playing ? t("rehearsal.transport.pause") : t("rehearsal.transport.play")}
      onClick={playing ? onPause : onPlay}
    />
  );

  return (
    <div role="group" aria-label={t("rehearsal.transport.label")} className={styles.bar}>
      {reducedMotion ? (
        <Button variant="secondary" onClick={() => onStep(-1)}>
          {t("rehearsal.transport.previous")}
        </Button>
      ) : null}
      {playPause}
      {atEnd && onShowCurtain ? (
        <Button variant="secondary" onClick={onShowCurtain}>
          {t("rehearsal.curtain.show")}
        </Button>
      ) : null}
      {reducedMotion ? (
        <Button variant="secondary" onClick={() => onStep(1)}>
          {t("rehearsal.transport.next")}
        </Button>
      ) : (
        <SegmentedControl
          aria-label={t("rehearsal.transport.speedLabel")}
          segments={[
            { id: "15", label: t("rehearsal.transport.speed15") },
            { id: "60", label: t("rehearsal.transport.speed60") },
            { id: "240", label: t("rehearsal.transport.speed240") },
          ]}
          value={String(speed)}
          onChange={(id) => onSpeed(Number(id) as PlaybackSpeed)}
        />
      )}
      {/* The wrapper turns the slider's pointer and key release into the scrub release. */}
      <div
        role="presentation"
        className={styles.scrub}
        onPointerUp={onScrubRelease}
        onKeyUp={onScrubRelease}
        onKeyDownCapture={handleScrubKeyDown}
        onBlur={onScrubRelease}
      >
        <Slider
          aria-label={t("rehearsal.transport.scrub")}
          min={openMinute}
          max={closeMinute}
          step={1}
          value={Math.floor(minute)}
          onChange={onScrub}
          formatValue={formatMinute}
        />
      </div>
      <Text as="span" className={styles.time}>
        {formatMinute(minute)}
      </Text>
    </div>
  );
}
