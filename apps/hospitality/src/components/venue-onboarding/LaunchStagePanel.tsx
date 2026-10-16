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
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
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

/** The row's visible detail line — copy from ux.md § Copy → Launch stages, via the locale's catalog. */
function detailFor(
  t: TFunction,
  stage: LaunchStageId,
  state: LaunchStageState,
  ctx: DetailContext
): ReactNode {
  if (stage === "venue") {
    if (state === "pending") return EM_DASH;
    if (state === "in-flight") return t("onboarding.stagePanel.creating", { name: ctx.venueName });
    if (state === "done") return t("onboarding.stagePanel.created", { name: ctx.venueName });
    return t("onboarding.stagePanel.venueFailed");
  }
  if (stage === "floorPlan") {
    if (state === "pending") return EM_DASH;
    if (state === "in-flight") return t("onboarding.stagePanel.creating", { name: ctx.planName });
    if (state === "done") return t("onboarding.stagePanel.created", { name: ctx.planName });
    return t("onboarding.stagePanel.planFailed");
  }
  if (stage === "tables") {
    if (state === "pending") return t("onboarding.stagePanel.toPlace", { count: ctx.total });
    if (state === "done") return t("onboarding.stagePanel.placed", { count: ctx.total });
    const counter = (
      <Text variant="detail" aria-hidden="true" data-testid="tables-counter">
        {t("onboarding.stagePanel.counter", { current: ctx.done + 1, total: ctx.total })}
      </Text>
    );
    const lead =
      state === "in-flight"
        ? t("onboarding.stagePanel.placing")
        : t("onboarding.stagePanel.stoppedAt");
    return (
      <>
        {lead} {counter}
      </>
    );
  }
  // activate
  if (state === "pending") return EM_DASH;
  if (state === "in-flight") return t("onboarding.stagePanel.activating");
  if (state === "done") return t("onboarding.stagePanel.live");
  return t("onboarding.stagePanel.activateFailed");
}

/**
 * One sentence, derived purely from progress — no internal state. Stable
 * across re-renders that only bump the table counter (the tables in-flight
 * branch deliberately never mentions `k`), so it never floods a screen
 * reader with "8 of 14", "9 of 14", ... "one sentence per stage transition,
 * not per table" (ux.md S6/S7).
 */
function announcementFor(
  t: TFunction,
  progress: LaunchProgress,
  stages: readonly LaunchStageId[],
  ctx: DetailContext
): string {
  const activeStage = progress.failedStage ?? progress.inFlightStage;
  if (activeStage === "tables") {
    return progress.failedStage === "tables"
      ? t("onboarding.stagePanel.announceStopped")
      : t("onboarding.stagePanel.announcePlacing");
  }
  if (activeStage !== null) {
    const text = detailFor(t, activeStage, stageStateOf(progress, activeStage), ctx);
    return typeof text === "string" ? text : "";
  }
  const complete = stages.every((stage) => stageStateOf(progress, stage) === "done");
  return complete ? t("onboarding.stagePanel.live") : "";
}

function grooveClass(precedingState: LaunchStageState): string {
  if (precedingState === "done") return styles.grooveFilled ?? "";
  if (precedingState === "in-flight") return styles.grooveLive ?? "";
  return styles.grooveDotted ?? "";
}

export function LaunchStagePanel({ progress, draft, venueName }: LaunchStagePanelProps) {
  const { t } = useTranslation();
  const stages = stagesFor(draft);
  const ctx: DetailContext = {
    venueName,
    planName: draft.planName,
    total: draft.tables.length,
    done: tablesDoneCount(progress),
  };
  const tablesPercent = ctx.total > 0 ? Math.round((ctx.done / ctx.total) * 100) : 0;

  return (
    <section className={styles.panel} aria-label={t("onboarding.stagePanel.label")}>
      <Text className={styles.srOnly} variant="detail" aria-live="polite">
        {announcementFor(t, progress, stages, ctx)}
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
                  {t(`onboarding.launch.stages.${stage}`)}
                </Text>
                <Text className={styles.detail} variant="detail">
                  {detailFor(t, stage, state, ctx)}
                </Text>
                {showProgress && (
                  <Progress
                    className={styles.progress}
                    value={tablesPercent}
                    showValue
                    aria-hidden="true"
                    aria-label={t("onboarding.stagePanel.progress", {
                      stage: t(`onboarding.launch.stages.${stage}`),
                    })}
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
