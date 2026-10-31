import { useState } from "react";
import type { AvailabilityConfig, AvailabilityConfigState } from "@mbe/types";
import { reapplyDraft, scheduleChangesSince, type ScheduleChangeSince } from "./conflict-review.js";
import { seedServices, type DraftService } from "./draft-changes.js";

interface Baseline {
  readonly config: AvailabilityConfig;
  readonly version: number;
}

export interface ConflictReview {
  /** The refetch has landed; until then there is nothing to compare with. */
  readonly loaded: boolean;
  readonly changes: ScheduleChangeSince;
}

interface Input {
  readonly state: AvailabilityConfigState;
  /** The schedule whose rows the draft starts from; none for a draft with nothing to compare. */
  readonly scheduleId: string | undefined;
  readonly services: readonly DraftService[];
  /** The name field is a rename of `scheduleId` (edit), not the name of a new schedule. */
  readonly name: string | null;
  readonly conflicted: boolean;
  readonly clearConflict: () => void;
  /** Replaces the draft with the answer the Manager chose. */
  readonly apply: (next: { services: DraftService[]; name: string | null }) => void;
  /** The schedule is gone, so there is nothing left to edit. */
  readonly onGone: () => void;
}

const NO_CHANGES: ScheduleChangeSince = {
  gone: false,
  renamedTo: null,
  added: [],
  removed: [],
  changed: [],
};

/**
 * Remembers the version a schedule drawer was seeded from. After a lost race (`conflicted`) it
 * says what changed since, and `reapply`/`discard` re-seed the draft from the winning version so
 * the next save is built from rows the Manager has seen (a colleague's new service survives).
 */
export function useConflictReview(input: Input) {
  const { state, scheduleId, services, name, conflicted } = input;
  const [baseline, setBaseline] = useState<Baseline>(() => ({
    config: state.config,
    version: state.version,
  }));
  const rowsOf = (config: AvailabilityConfig): DraftService[] =>
    scheduleId ? seedServices(config, { services: [] }, { kind: "schedule", scheduleId }) : [];
  const nameIn = (config: AvailabilityConfig) =>
    config.schedules.find((s) => s.id === scheduleId)?.name ?? "";

  const baselineServices = rowsOf(baseline.config);
  const loaded = state.version !== baseline.version;
  const changes =
    conflicted && loaded && scheduleId
      ? scheduleChangesSince(baseline.config, state.config, scheduleId)
      : NO_CHANGES;
  const review: ConflictReview | null = conflicted ? { loaded, changes } : null;

  const rebase = (next: { services: DraftService[]; name: string | null }) => {
    setBaseline({ config: state.config, version: state.version });
    input.apply(next);
    input.clearConflict();
  };

  return {
    baseline: baseline.config,
    /** The version a save is checked against: the one the draft was built from. */
    baselineVersion: baseline.version,
    baselineServices,
    baselineName: nameIn(baseline.config),
    review,
    /** The winning version with only the Manager's own changes on top. */
    reapply: () =>
      rebase({
        services: reapplyDraft({
          base: baselineServices,
          draft: services,
          latest: rowsOf(state.config),
        }),
        name: name === null || name !== nameIn(baseline.config) ? name : nameIn(state.config),
      }),
    /** The winning version as it is; the draft is dropped. */
    discard: () => {
      if (changes.gone) input.onGone();
      else
        rebase({
          services: rowsOf(state.config),
          name: name === null ? null : nameIn(state.config),
        });
    },
  };
}
