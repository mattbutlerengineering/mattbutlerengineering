import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState } from "@mbe/types";
import { useSaveAvailabilityConfig } from "../../hooks/useAvailability.js";
import { useApiClient } from "../../hooks/useApiClient.js";
import { useClearHolidayDecision, useSetHolidayDecision } from "../../hooks/useHolidayDecisions.js";
import type { PlannedDate } from "./AddSpecialDatesSheet.js";
import { availabilityProblemOf } from "./conflict-problem.js";
import type { DecidedHoliday } from "./holiday-decisions.js";

/** The three answers a holiday line offers. */
export type HolidayChoice = "closed" | "openAsUsual" | "specialHours";

/** A holiday with its name in the viewer's language and its date as a label ("Thu, Nov 26"). */
export interface NamedHoliday extends DecidedHoliday {
  readonly name: string;
  readonly dateLabel: string;
}

export interface HolidayLineStatus {
  readonly phase: "saving" | "failed";
  /** The choice being saved, or the one a Retry repeats. */
  readonly to: HolidayChoice;
}

/** What the closure sheet is told about one request from the panel. */
export interface HolidaySheetRequest {
  /** Runs once the sheet's rows are saved, not if it is cancelled. */
  readonly afterSaved?: () => Promise<void>;
  /** The sheet closed, saved or not: the lines are live again. */
  readonly onSettled: () => void;
}

/** What the panel's host (the Special dates tab) opens for the chains that need a sheet or a dialog. */
export interface HolidayFlow {
  /** Close dates through the closure path. */
  readonly onClose: (
    rows: readonly PlannedDate[],
    title: string,
    request: HolidaySheetRequest
  ) => void;
  /** Special hours for one date through the same sheet. */
  readonly onSpecialHours: (row: PlannedDate, request: HolidaySheetRequest) => void;
  /** Reopen a closure; `then` runs once it is reopened, not if cancelled. */
  readonly onReopen: (ruleId: string, then: () => void) => void;
  /** The rule's own edit, for a date that already has special hours. */
  readonly onEditHours: (date: string) => void;
}

export interface UseHolidayDecisionOptions {
  readonly venueId: string;
  readonly state: AvailabilityConfigState;
  readonly onStale: () => void;
  readonly flow: HolidayFlow;
  /** An Open as usual was saved: the line has left the list, so the panel keeps focus. */
  readonly onDecided: () => void;
}

const plannedOf = (h: NamedHoliday, kind: PlannedDate["kind"]): PlannedDate => ({
  date: h.date,
  name: h.name,
  kind,
});

/**
 * One holiday's save, per date (architecture.md B2). Every chain is ordered so that a failure
 * part-way leaves the holiday undecided or outranked, never wrongly decided: what was there is
 * removed before the open mark is written, and a new closure or special hours is written before
 * the mark is cleared. Any failure, including the 404 or 405 of an older server, is `failed`:
 * the line says so and offers Retry, and is never drawn as decided.
 */
export function useHolidayDecision(options: UseHolidayDecisionOptions) {
  const { venueId, state, onStale, flow, onDecided } = options;
  const { t } = useTranslation();
  const { toast } = useToast();
  const api = useApiClient();
  const set = useSetHolidayDecision();
  const clear = useClearHolidayDecision();
  const saveConfig = useSaveAvailabilityConfig();
  const [statuses, setStatuses] = useState<ReadonlyMap<string, HolidayLineStatus>>(() => new Map());
  const setStatus = (date: string, status: HolidayLineStatus | null) =>
    setStatuses((prev) => {
      const next = new Map(prev);
      if (status === null) next.delete(date);
      else next.set(date, status);
      return next;
    });

  const removeRule = (ruleId: string, version: number) =>
    saveConfig.mutateAsync({
      venueId,
      body: {
        expectedVersion: version,
        changes: { upsert: {}, remove: { dateRules: [ruleId] } },
        scopeConflicts: "keep",
      },
    });

  /** Runs `steps` as one save of `date`: saving, then settled or failed. Resolves true when saved. */
  const run = async (
    date: string,
    to: HolidayChoice,
    steps: () => Promise<void>
  ): Promise<boolean> => {
    setStatus(date, { phase: "saving", to });
    try {
      await steps();
      setStatus(date, null);
      return true;
    } catch (error) {
      if (availabilityProblemOf(error)?.code === "version-conflict") onStale();
      setStatus(date, { phase: "failed", to });
      return false;
    }
  };

  const openAsUsual = async (holiday: NamedHoliday): Promise<void> => {
    const { state: from } = holiday;
    const saved = await run(holiday.date, "openAsUsual", async () => {
      // What was there goes first: if this fails nothing changed.
      if (from.kind === "specialHours") await removeRule(from.ruleId, state.version);
      await set.mutateAsync({ venueId, serviceDate: holiday.date, decision: "open_as_usual" });
    });
    if (!saved) return;
    onDecided();
    toast({
      title: t("availabilitySpecial.holidays.openAsUsualToast", { name: holiday.name }),
      // A removed special-hours rule has its own History entry; only the mark can be taken back.
      ...(from.kind === "specialHours"
        ? {}
        : {
            action: {
              label: t("availability.undo.action"),
              onClick: () =>
                void clear.mutateAsync({ venueId, serviceDate: holiday.date }).catch(() => {
                  // The mark stays: the line still reads Open as usual, which is true.
                }),
            },
          }),
    });
  };

  /**
   * After a closure or special hours is saved: the open mark, old hours or closure it replaces are
   * outranked (or, for the closure, reopened through its own dialog, which can be cancelled).
   */
  const tidyAfter = (holiday: NamedHoliday) => async (): Promise<void> => {
    const { state: from } = holiday;
    // Best effort: the new rule outranks all of them, so a failure here leaves the line right.
    if (from.kind === "openAsUsual") {
      await clear.mutateAsync({ venueId, serviceDate: holiday.date }).catch(() => undefined);
    }
    if (from.kind === "closed") flow.onReopen(from.ruleId, () => undefined);
    if (from.kind === "specialHours") {
      try {
        const fresh = await api.availability.getConfig(venueId);
        await removeRule(from.ruleId, fresh.version);
      } catch {
        // The closure outranks the old hours; nothing is wrong on screen.
      }
    }
  };

  /** Presses `to` on `holiday`: a save, or the sheet or dialog that makes it. */
  const decide = (holiday: NamedHoliday, to: HolidayChoice): void => {
    const { state: from } = holiday;
    if (to === from.kind) {
      if (to === "specialHours") flow.onEditHours(holiday.date);
      return;
    }
    if (to === "openAsUsual") {
      if (from.kind === "closed") {
        flow.onReopen(
          from.ruleId,
          () => void openAsUsual({ ...holiday, state: { kind: "undecided" } })
        );
      } else {
        void openAsUsual(holiday);
      }
      return;
    }
    const row = plannedOf(holiday, to === "closed" ? "closed" : "hours");
    // The sheet is the save: the line is saving until it closes, and nothing else is pressed.
    setStatus(holiday.date, { phase: "saving", to });
    const request: HolidaySheetRequest = {
      ...(from.kind === "undecided" ? {} : { afterSaved: tidyAfter(holiday) }),
      onSettled: () => setStatus(holiday.date, null),
    };
    if (to === "closed") {
      const names = `${holiday.name}, ${holiday.dateLabel}`;
      flow.onClose([row], t("availabilitySpecial.holidays.closedToast", { names }), request);
    } else {
      flow.onSpecialHours(row, request);
    }
  };

  /** Closes several holidays in one sheet: every one of them is saving until it closes. */
  const closeMany = (holidays: readonly NamedHoliday[], title: string): void => {
    for (const h of holidays) setStatus(h.date, { phase: "saving", to: "closed" });
    flow.onClose(
      holidays.map((h) => plannedOf(h, "closed")),
      title,
      { onSettled: () => holidays.forEach((h) => setStatus(h.date, null)) }
    );
  };

  const retry = (holiday: NamedHoliday): void => {
    const to = statuses.get(holiday.date)?.to;
    if (to) decide(holiday, to);
  };

  const busy = [...statuses.values()].some((s) => s.phase === "saving");
  return { statuses, busy, decide, closeMany, retry };
}
