import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Text } from "@mattbutlerengineering/rialto";
import type { AutopilotMove } from "@mbe/types";
import styles from "./AutopilotPanel.module.css";

export interface AutopilotPanelProps {
  /** Moves still worth showing: the page has already dropped the ones the host dismissed. */
  moves: readonly AutopilotMove[];
  onDismissMove: (moveId: string) => void;
  onDismissNight: () => void;
}

/**
 * The accessible source for Autopilot's suggestions (the ghost blocks on the grid are
 * `aria-hidden`). Collapsed by default with a count; renders nothing when there is nothing to say.
 * Suggestions only: the seam for an approve action (#9493) is the `actions` row of each move.
 */
export function AutopilotPanel({ moves, onDismissMove, onDismissNight }: AutopilotPanelProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const headingId = useId();
  const bodyId = useId();

  // Escape closes an open panel only while focus is inside it, and hands focus back to the toggle.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || !panelRef.current?.contains(document.activeElement)) return;
      event.stopPropagation();
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (moves.length === 0) return null;

  return (
    <section
      ref={panelRef}
      className={styles.panel}
      aria-labelledby={headingId}
      data-testid="autopilot-panel"
    >
      <div className={styles.header}>
        <Text variant="label" as="h2" id={headingId} className={styles.heading}>
          {t("timeline.autopilot.heading")}
        </Text>
        <Button
          ref={toggleRef}
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={t("timeline.autopilot.toggleName", { count: moves.length })}
          onClick={() => setOpen((v) => !v)}
        >
          <Badge variant="neutral" size="sm" aria-hidden="true">
            {moves.length}
          </Badge>
          <Text className={styles.chevron} aria-hidden="true" data-open={open}>
            ▾
          </Text>
        </Button>
      </div>
      {open && (
        <div id={bodyId} className={styles.body}>
          <Text variant="caption" color="secondary">
            {t("timeline.autopilot.intro")}
          </Text>
          <ul className={styles.list} aria-label={t("timeline.autopilot.listLabel")}>
            {moves.map((move) => (
              <MoveItem key={move.id} move={move} onDismiss={onDismissMove} />
            ))}
          </ul>
          <Button variant="ghost" size="sm" onClick={onDismissNight}>
            {t("timeline.autopilot.dismissNight")}
          </Button>
        </div>
      )}
    </section>
  );
}

function MoveItem({
  move,
  onDismiss,
}: {
  move: AutopilotMove;
  onDismiss: (moveId: string) => void;
}) {
  const { t } = useTranslation();
  const params = {
    party: move.partyLabel,
    size: move.partySize,
    from: move.fromTableName ?? "",
    to: move.toTableName,
  };
  const isReseat = move.kind === "reseat";
  return (
    <li className={styles.item}>
      <div className={styles.itemText}>
        <Text as="span" variant="body">
          {t(isReseat ? "timeline.autopilot.reseat" : "timeline.autopilot.offer", params)}
        </Text>
        <Text as="span" variant="caption" color="secondary">
          {t(isReseat ? "timeline.autopilot.reseatWhy" : "timeline.autopilot.offerWhy", params)}
        </Text>
      </div>
      {/* Seam for #9493: the approve button joins this row; dismiss stays last. */}
      <div className={styles.actions}>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("timeline.autopilot.dismissMoveFor", { party: move.partyLabel })}
          onClick={() => onDismiss(move.id)}
        >
          {t("timeline.autopilot.dismissMove")}
        </Button>
      </div>
    </li>
  );
}
