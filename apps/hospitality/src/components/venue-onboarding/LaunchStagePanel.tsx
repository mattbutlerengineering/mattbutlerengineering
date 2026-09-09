/**
 * The four-stage Launch readout. Presentational only: derives every row's
 * state from `progress` via `stagesFor` / `stageStateOf` (#4754) — it holds
 * no state of its own and decides nothing about the sequence itself.
 *
 * Rejected alternatives (ux.md S6): `Handshake` only ever lights the two
 * endpoints of the active leg, so a stage finished two steps ago and a
 * stage that hasn't started render identically — exactly the distinction
 * this panel exists to draw. `Steps` has no failed state, `WatchLoader`
 * carries no progress semantics, a single `Progress` bar can't say which
 * stage failed. This composes `StatusLED`, the same primitive `Handshake`
 * itself composes.
 */
import type { ReactNode } from "react";
import { StatusLED, Progress, Text } from "@mattbutlerengineering/rialto";
import type { StatusLEDProps } from "@mattbutlerengineering/rialto";
import type { FloorPlanDraft } from "./floor-plan-draft.js";
import type { LaunchProgress, LaunchStageId, LaunchStageState } from "./launch-sequence.js";
import { stagesFor, stageStateOf, tablesDoneCount } from "./launch-sequence.js";
import styles from "./LaunchStagePanel.module.css";

export interface LaunchStagePanelProps {
  progress: LaunchProgress;
  draft: FloorPlanDraft;
  /** For the Venue row's detail lines. */
  venueName: string;
}

const STAGE_LABEL: Record<LaunchStageId, string> = {
  venue: "Venue",
  floorPlan: "Floor plan",
  tables: "Tables",
  activate: "Activate",
};

const LED_VARIANT: Record<LaunchStageState, NonNullable<StatusLEDProps["variant"]>> = {
  pending: "off",
  "in-flight": "accent",
  done: "success",
  failed: "danger",
};

const EM_DASH = "—";

interface DetailContext {
  venueName: string;
  planName: string;
  total: number;
  done: number;
}

/** The row's visible detail line — verbatim copy from ux.md § Copy → Launch stages. */
function detailFor(stage: LaunchStageId, state: LaunchStageState, ctx: DetailContext): ReactNode {
  if (stage === "venue") {
    if (state === "pending") return EM_DASH;
    if (state === "in-flight") return `Creating ${ctx.venueName}`;
    if (state === "done") return `${ctx.venueName} created`;
    return "Couldn't create the venue";
  }
  if (stage === "floorPlan") {
    if (state === "pending") return EM_DASH;
    if (state === "in-flight") return `Creating ${ctx.planName}`;
    if (state === "done") return `${ctx.planName} created`;
    return "Couldn't create the floor plan";
  }
  if (stage === "tables") {
    if (state === "pending") return `${ctx.total} to place`;
    if (state === "done") return `${ctx.total} tables placed`;
    const k = ctx.done + 1;
    const counter = (
      <Text variant="detail" aria-hidden="true" data-testid="tables-counter">
        {k} of {ctx.total}
      </Text>
    );
    return state === "in-flight" ? <>Placing table {counter}</> : <>Stopped at table {counter}</>;
  }
  // activate
  if (state === "pending") return EM_DASH;
  if (state === "in-flight") return "Making the plan live";
  if (state === "done") return "Live";
  return "Couldn't make the plan live";
}

/**
 * One sentence, derived purely from progress — no internal state. Stable
 * across re-renders that only bump the table counter (the tables in-flight
 * branch deliberately never mentions `k`), so it never floods a screen
 * reader with "8 of 14", "9 of 14", ... "one sentence per stage transition,
 * not per table" (ux.md S6/S7).
 */
function announcementFor(
  progress: LaunchProgress,
  stages: readonly LaunchStageId[],
  ctx: DetailContext
): string {
  const activeStage = progress.failedStage ?? progress.inFlightStage;
  if (activeStage === "tables") {
    return progress.failedStage === "tables" ? "Stopped placing tables" : "Placing tables";
  }
  if (activeStage !== null) {
    const text = detailFor(activeStage, stageStateOf(progress, activeStage), ctx);
    return typeof text === "string" ? text : "";
  }
  const complete = stages.every((stage) => stageStateOf(progress, stage) === "done");
  return complete ? "Live" : "";
}

function grooveClass(precedingState: LaunchStageState): string {
  if (precedingState === "done") return styles.grooveFilled ?? "";
  if (precedingState === "in-flight") return styles.grooveLive ?? "";
  return styles.grooveDotted ?? "";
}

export function LaunchStagePanel({ progress, draft, venueName }: LaunchStagePanelProps) {
  const stages = stagesFor(draft);
  const ctx: DetailContext = {
    venueName,
    planName: draft.planName,
    total: draft.tables.length,
    done: tablesDoneCount(progress),
  };
  const tablesPercent = ctx.total > 0 ? Math.round((ctx.done / ctx.total) * 100) : 0;

  return (
    <section className={styles.panel} aria-label="Launch progress">
      <Text className={styles.srOnly} variant="detail" aria-live="polite">
        {announcementFor(progress, stages, ctx)}
      </Text>
      <ol className={styles.rows}>
        {stages.map((stage, index) => {
          const state = stageStateOf(progress, stage);
          const showProgress = stage === "tables" && state === "in-flight";

          return (
            <li key={stage} className={styles.row} data-state={state}>
              <div className={styles.rail}>
                <div className={styles.ledWrap} data-variant={LED_VARIANT[state]}>
                  <StatusLED variant={LED_VARIANT[state]} pulse={state === "in-flight"} size="md" />
                </div>
                {index < stages.length - 1 && (
                  <div className={`${styles.groove} ${grooveClass(state)}`} aria-hidden="true" />
                )}
              </div>
              <div className={styles.rowBody}>
                <Text className={styles.label} variant="detail">
                  {STAGE_LABEL[stage]}
                </Text>
                <Text className={styles.detail} variant="detail">
                  {detailFor(stage, state, ctx)}
                </Text>
                {showProgress && (
                  <Progress
                    className={styles.progress}
                    value={tablesPercent}
                    showValue
                    aria-hidden="true"
                    aria-label={`${STAGE_LABEL[stage]} progress`}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
