import type { Layer, ResolvedDay } from "@mbe/availability";
import type { AvailabilityConfigState } from "@mbe/types";
import type { SeriesScope } from "./series-edit.js";

export interface LayerRuleActionsProps {
  readonly layer: Layer;
  readonly date: string;
  readonly day: ResolvedDay;
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly timezone: string;
  readonly today: string;
  /** An editor is open, or a reload is due: a save now would conflict with one of ours. */
  readonly waiting: boolean;
  readonly reasonId: string;
  /** The rule was removed or its dates changed and saved; the drawer closes. */
  readonly onFinished: () => void;
  readonly onStale: () => void;
  /** Edit special hours: focus the editor, for the whole rule or part of it when `scope` is set. */
  readonly onEditHours: (scope?: { ruleId: string; mode: SeriesScope }) => void;
  /** Edit a dated schedule everywhere it runs: the Schedules tab's editor, over the page. */
  readonly onEditSchedule?: (scheduleId: string) => void;
}
