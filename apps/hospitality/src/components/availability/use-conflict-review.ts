import { useState } from "react";
import type { AvailabilityConfig, AvailabilityConfigState } from "@mbe/types";
import { reapplyDraft, scheduleChangesSince, type ScheduleChangeSince } from "./conflict-review.js";
import { seedServices, type DraftService } from "./draft-changes.js";

interface Baseline {
  readonly config: AvailabilityConfig;
  readonly version: number;
  /** The schedule the draft's rows were seeded from, fixed when the drawer opened. */
  readonly scheduleId: string | undefined;
}

/**
 * What the draft is. An `edit` changes a schedule that exists, so a colleague's change to that
 * schedule can be named and laid under the Manager's. A `regularWeek` starts from the regular
 * week's rows but saves a new schedule. A `draft` (new or duplicate) saves a new schedule that
 * depends on nothing stored, so there is no schedule to compare, only a version that moved.
 */
export type ConflictReviewKind = "edit" | "regularWeek" | "draft";

export interface ConflictReview {
  readonly kind: ConflictReviewKind;
  /** The refetch has landed; until then there is nothing to compare with. */
  readonly loaded: boolean;
  readonly changes: ScheduleChangeSince;
}

interface Input {
  readonly kind: ConflictReviewKind;
  readonly state: AvailabilityConfigState;
  /**
   * The schedule whose rows the draft starts from, as the latest state has it (the regular week
   * can move to another schedule); none for a draft with nothing to compare. The drawer reads
   * it once, when it opens, and keeps that as where its rows came from.
   */
  readonly scheduleId: string | undefined;
  readonly services: readonly DraftService[];
  /** The name field is a rename of `scheduleId` (edit), not the name of a new schedule. */
  readonly name: string | null;
  readonly conflicted: boolean;
  readonly clearConflict: () => void;
  /** Replaces the draft with the answer the Manager chose. */
  readonly apply: (next: { services: DraftService[]; name: string | null }) => void;
  /** Starts the whole draft again (name, dates and all) from these rows; for non-edit drafts. */
  readonly startOver: (services: DraftService[]) => void;
  /** The schedule is gone, so there is nothing left to edit. */
  readonly onGone: () => void;
}

const NO_CHANGES: ScheduleChangeSince = {
  gone: false,
  replacedBy: null,
  renamedTo: null,
  added: [],
  removed: [],
  changed: [],
};

const rowsOf = (config: AvailabilityConfig, scheduleId: string | undefined): DraftService[] =>
  scheduleId ? seedServices(config, { services: [] }, { kind: "schedule", scheduleId }) : [];

/**
 * Remembers the version a schedule drawer was seeded from. After a lost race (`conflicted`) it
 * says what changed since, and `reapply`/`discard` re-seed the draft from the winning version so
 * the next save is built from rows the Manager has seen (a colleague's new service survives).
 * Only an edit has a schedule to compare; the other kinds say that availability changed and let
 * the Manager keep the draft or start over.
 */
export function useConflictReview(input: Input) {
  const { kind, state, services, name, conflicted } = input;
  const [baseline, setBaseline] = useState<Baseline>(() => ({
    config: state.config,
    version: state.version,
    scheduleId: input.scheduleId,
  }));
  const pinned = baseline.scheduleId;
  const latestId = kind === "regularWeek" ? input.scheduleId : pinned;
  const nameIn = (config: AvailabilityConfig) =>
    config.schedules.find((s) => s.id === pinned)?.name ?? "";

  const baselineServices = rowsOf(baseline.config, pinned);
  const loaded = state.version !== baseline.version;
  const compared =
    conflicted && loaded && kind !== "draft" && pinned && latestId
      ? scheduleChangesSince(baseline.config, state.config, pinned, latestId)
      : NO_CHANGES;
  // A new regular week saves a new schedule, so a missing regular week is not a dead end.
  const changes = kind === "regularWeek" ? { ...compared, gone: false } : compared;
  const review: ConflictReview | null = conflicted ? { kind, loaded, changes } : null;

  const rebase = () =>
    setBaseline({ config: state.config, version: state.version, scheduleId: input.scheduleId });
  const settle = (next: () => void) => {
    rebase();
    next();
    input.clearConflict();
  };
  const latestRows = () => rowsOf(state.config, kind === "draft" ? pinned : latestId);

  return {
    baseline: baseline.config,
    /** The version a save is checked against: the one the draft was built from. */
    baselineVersion: baseline.version,
    baselineServices,
    baselineName: nameIn(baseline.config),
    review,
    /** The winning version with only the Manager's own changes on top. */
    reapply: () =>
      settle(() => {
        if (kind === "draft") return; // a new schedule depends on nothing that moved
        const latest = latestId && !changes.gone ? rowsOf(state.config, latestId) : null;
        input.apply({
          services: latest
            ? reapplyDraft({ base: baselineServices, draft: services, latest })
            : [...services],
          name: name === null || name !== nameIn(baseline.config) ? name : nameIn(state.config),
        });
      }),
    /** The winning version as it is; the draft is dropped. */
    discard: () => {
      if (kind === "edit") {
        if (changes.gone) input.onGone();
        else
          settle(() =>
            input.apply({
              services: latestRows(),
              name: name === null ? null : nameIn(state.config),
            })
          );
        return;
      }
      settle(() => input.startOver(latestRows()));
    },
  };
}
