import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Text } from "@mattbutlerengineering/rialto";
import type { AutopilotMove } from "@mbe/types";
import type { ApproveOutcome } from "../../hooks/useApproveAutopilotMove.js";
import { partyName } from "./autopilot-party.js";
import styles from "./AutopilotPanel.module.css";

export interface AutopilotPanelProps {
  /** Moves still worth showing: the page has already dropped the ones the host dismissed. */
  moves: readonly AutopilotMove[];
  /** The move being applied right now, if any; every Approve waits for it. */
  approvingMoveId: string | null;
  /** Applies one move; resolves once it is done, stale or failed. */
  onApproveMove: (move: AutopilotMove) => Promise<ApproveOutcome>;
  onDismissMove: (moveId: string) => void;
  onDismissNight: () => void;
}

/**
 * The accessible source for Autopilot's suggestions (the ghost blocks on the grid are
 * `aria-hidden`). Collapsed by default with a count; renders nothing when there is nothing to say.
 * Each move has one-tap Approve (no confirm: the toast's Undo is the safety net) and Dismiss.
 */
export function AutopilotPanel({
  moves,
  approvingMoveId,
  onApproveMove,
  onDismissMove,
  onDismissNight,
}: AutopilotPanelProps) {
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

  // After a single dismiss the row is gone and focus with it: land on the next row's Dismiss,
  // else the previous one's. (Dismissing the last row unmounts the panel; the page then moves focus.)
  const pendingFocusId = useRef<string | null>(null);
  useEffect(() => {
    const id = pendingFocusId.current;
    if (id === null) return;
    pendingFocusId.current = null;
    panelRef.current?.querySelector<HTMLElement>(`[data-move-id="${CSS.escape(id)}"]`)?.focus();
  }, [moves]);

  function dismissMove(moveId: string) {
    const index = moves.findIndex((m) => m.id === moveId);
    const neighbour = moves[index + 1] ?? moves[index - 1];
    pendingFocusId.current = neighbour?.id ?? null;
    onDismissMove(moveId);
  }

  // Approving works like dismissing for focus: the row leaves, so focus goes to a neighbour. If the
  // move did not apply, the row stays and focus returns to the button that was pressed.
  async function approveMove(move: AutopilotMove) {
    const index = moves.findIndex((m) => m.id === move.id);
    const neighbour = moves[index + 1] ?? moves[index - 1];
    pendingFocusId.current = neighbour?.id ?? null;
    const outcome = await onApproveMove(move);
    if (outcome !== "failed") return;
    pendingFocusId.current = null;
    panelRef.current
      ?.querySelector<HTMLElement>(`[data-approve-id="${CSS.escape(move.id)}"]`)
      ?.focus();
  }

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
              <MoveItem
                key={move.id}
                move={move}
                approvingMoveId={approvingMoveId}
                onApprove={approveMove}
                onDismiss={dismissMove}
              />
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
  approvingMoveId,
  onApprove,
  onDismiss,
}: {
  move: AutopilotMove;
  approvingMoveId: string | null;
  onApprove: (move: AutopilotMove) => void;
  onDismiss: (moveId: string) => void;
}) {
  const { t } = useTranslation();
  const party = partyName(t, move.partyLabel, move.partySize);
  const params = {
    party,
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
      <div className={styles.actions}>
        <Button
          variant="primary"
          size="sm"
          data-approve-id={move.id}
          isLoading={approvingMoveId === move.id}
          disabled={approvingMoveId !== null}
          aria-label={t("timeline.autopilot.approveFor", { party })}
          onClick={() => onApprove(move)}
        >
          {t("timeline.autopilot.approve")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-move-id={move.id}
          aria-label={t("timeline.autopilot.dismissMoveFor", { party })}
          onClick={() => onDismiss(move.id)}
        >
          {t("timeline.autopilot.dismissMove")}
        </Button>
      </div>
    </li>
  );
}
