import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { ConflictDialog, type ConflictDraftRow } from "./ConflictDialog.js";
import { minutesOf, type QuickSetupDraft } from "./quick-setup-draft.js";
import type { ConflictReview } from "./use-conflict-review.js";
import type { useScheduleSave } from "./use-schedule-save.js";

/** A week draft's services as the dialog's "Your draft" lists them; one with a time missing is left out. */
export function draftRows(draft: QuickSetupDraft): ConflictDraftRow[] {
  return draft.services.flatMap((service) => {
    const minutes = minutesOf(service);
    return minutes
      ? [
          {
            key: service.id,
            name: service.name,
            opensAt: minutes.opensAt,
            closesAt: minutes.closesAt,
          },
        ]
      : [];
  });
}

/** Other hours the Manager ticked in Also apply to, changed or removed by the winning save. */
interface AlsoApplySince {
  readonly changed: readonly string[];
  readonly removed: readonly string[];
}

type NamedLine = "added" | "removed" | "changed" | "alsoChanged" | "alsoRemoved";

/** What the winning version changed in the hours the draft was built from, a line each. */
function conflictLines(
  changes: ConflictReview["changes"],
  alsoApply: AlsoApplySince | undefined,
  t: TFunction,
  locale: string
): string[] {
  const list = new Intl.ListFormat(locale, { type: "conjunction" });
  const named = (key: NamedLine, names: readonly string[] | undefined) =>
    names && names.length > 0
      ? [t(`availabilitySchedules.conflictReview.${key}`, { names: list.format(names) })]
      : [];
  return [
    ...(changes.replacedBy !== null
      ? [t("availabilitySchedules.conflictReview.regularReplaced", { name: changes.replacedBy })]
      : []),
    ...(changes.renamedTo !== null
      ? [t("availabilitySchedules.conflictReview.renamed", { name: changes.renamedTo })]
      : []),
    ...named("added", changes.added),
    ...named("removed", changes.removed),
    ...named("changed", changes.changed),
    ...named("alsoChanged", alsoApply?.changed),
    ...named("alsoRemoved", alsoApply?.removed),
  ];
}

export interface FormConflictDialogProps {
  readonly saver: Pick<ReturnType<typeof useScheduleSave>, "conflict" | "clearConflict">;
  /** What `use-conflict-review.ts` found changed; `null` while there is no conflict. */
  readonly review: ConflictReview | null;
  /** The draft, for "Your draft". */
  readonly rows: readonly ConflictDraftRow[];
  readonly alsoApply?: AlsoApplySince;
  /** Why the reload of the latest version failed, as the page words it. */
  readonly reloadError?: string | null;
  /** Asks for the latest version again (the form's `onStale`). */
  readonly onReload: () => void;
  readonly onReapply: () => void;
  readonly onStartOver: () => void;
  /** Discard mine: what the form's own Discard or Cancel does, without asking. */
  readonly onDiscard: () => void;
  /** Where focus goes when the answer removed or disabled the control that opened the dialog. */
  readonly returnFocus?: RefObject<HTMLElement | null>;
}

/**
 * The one conflict dialog (`ConflictDialog`) for the forms that save through `useScheduleSave` and
 * review through `use-conflict-review.ts`: the weekly form, its drawers and the compare table.
 *
 * Overwrite is off in all of them, pending the Owner (availability-hub E4.3 review): it would write
 * the Manager's whole draft over the colleague's version without the dialog saying what is lost.
 * `useScheduleSave().overwrite` stays, pinned by its own tests, and no form calls it.
 */
export function FormConflictDialog(props: FormConflictDialogProps) {
  const { saver, review, returnFocus } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const { conflict } = saver;
  if (!conflict || !review) return null;

  // The dialog hands focus back to the control that opened it. When the answer removed or
  // disabled that control (a clean form has no Save), focus would be left on the page.
  const leave = (answer: () => void) => () => {
    answer();
    if (!returnFocus) return;
    window.setTimeout(() => {
      const active = document.activeElement;
      if (!active || active === document.body) returnFocus.current?.focus();
    }, 0);
  };

  return (
    <ConflictDialog
      open
      winningChange={conflict.winningChange}
      {...(conflict.changesSince ? { changesSince: conflict.changesSince } : {})}
      services={props.rows}
      // Nothing saves from this dialog: every answer here changes the draft, not the stored hours.
      isSaving={false}
      ready={false}
      unavailableNote={t("availabilityHub.conflict.overwriteNotOffered")}
      changedAgain={false}
      answers={{
        loaded: review.loaded,
        gone: review.changes.gone,
        lines: conflictLines(review.changes, props.alsoApply, t, format.locale),
        onReapply: leave(props.onReapply),
        onStartOver: leave(props.onStartOver),
        reloadError: props.reloadError ?? null,
        onReload: props.onReload,
      }}
      // Unreachable while `ready` is false: the button is disabled.
      onOverwrite={() => undefined}
      onDiscard={leave(props.onDiscard)}
      onBack={leave(saver.clearConflict)}
    />
  );
}
