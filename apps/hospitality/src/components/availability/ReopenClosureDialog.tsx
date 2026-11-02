import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  Select,
  Text,
  useToast,
} from "@mattbutlerengineering/rialto";
import { stillClosedAfterReopen } from "@mbe/availability";
import {
  AvailabilityConfigProblemSchema,
  type ClosureOverlap,
  type DateRule,
  type StrandedReservation,
  type VenueService,
} from "@mbe/types";
import { useAvailabilityUndo } from "../../hooks/useAvailabilityUndo.js";
import { useReopenClosure } from "../../hooks/useClosures.js";
import { useRefreshAvailability } from "../../hooks/useRefreshAvailability.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { addDays } from "../../utils/service-day.js";
import { overlapLines } from "./closure-overlap-text.js";
import { conflictOf } from "./conflict-problem.js";
import { StrandedBookings } from "./StrandedBookings.js";

const NOTHING_STAYS: ClosureOverlap = { everyDate: false, by: [] };

export interface ReopenClosureDialogProps {
  readonly venueId: string;
  readonly ruleId: string;
  /** What is reopened, named whole: "Thu, Dec 24", "Thu, Dec 24 to Tue, Jan 5", "every Monday (…)". */
  readonly subject: string;
  /**
   * Bookings the closure cancelled; the opt-in notice goes to these guests. `null` when the
   * count could not be read: Reopen waits for it, because the notice is not undoable.
   */
  readonly cancelled: number | null;
  /** Of those, the guests whose booking has not started: the only ones a notice can reach. */
  readonly notifiable?: number | null;
  /** The count is unknown because reading it failed, not because it is still loading. */
  readonly countFailed?: boolean;
  /** Asks again for the count; shown with the notice that it is unknown. */
  readonly onRetryCount: () => void;
  /** Skips and one-date edits of a series; reopening the series removes them too. */
  readonly editedDates?: number;
  /** This closure is one date of a repeating closure that stays: removing it hands the date back. */
  readonly isSeriesEdit?: boolean;
  /** The subject covers many dates (a range, an open end or a repeat), not one. */
  readonly subjectIsSpan?: boolean;
  /** A Manager may reopen one date of this bounded range and keep the rest closed. */
  readonly canPickDate?: boolean;
  /** The venue's date rules, and the one being reopened, to say what stays closed without it. */
  readonly rules: readonly DateRule[];
  readonly rule: DateRule;
  /** Today on the venue clock. */
  readonly today: string;
  readonly services: readonly VenueService[];
  readonly onClose: () => void;
}

/** What a refused reopen shows: the sentence, the bookings the server named, and how many it did not. */
interface Failure {
  readonly text: string;
  readonly listed: readonly StrandedReservation[];
  readonly unlisted: number;
}

/**
 * The bookings a refused reopen would leave without service, or `null` for any other refusal. The
 * server sends one issue per booking, so their count is the true count; only some carry the
 * booking, and an older server names none.
 */
function strandedOf(error: unknown): Failure | null {
  const details = (error as { problemDetails?: unknown } | null)?.problemDetails;
  const problem = AvailabilityConfigProblemSchema.safeParse(details);
  if (!problem.success || problem.data.code !== "invalid-config") return null;
  const stranded = problem.data.issues?.filter((i) => i.code === "strands_booking") ?? [];
  if (stranded.length === 0) return null;
  const listed = stranded.flatMap((i) => (i.reservation ? [i.reservation] : []));
  return { text: "", listed, unlisted: stranded.length - listed.length };
}

function failureOf(error: unknown, t: TFunction): Failure {
  const stranded = strandedOf(error);
  if (stranded === null) return { text: describeApiError(error).detail, listed: [], unlisted: 0 };
  const count = stranded.listed.length + stranded.unlisted;
  return { ...stranded, text: t("availabilitySpecial.reopen.stranded", { count }) };
}

/** A span has no singular article to agree with ("el todas las fechas…"), so it gets its own title. */
function titleKey(props: ReopenClosureDialogProps): "titleSeriesEdit" | "titleSpan" | "title" {
  if (props.isSeriesEdit) return "titleSeriesEdit";
  return props.subjectIsSpan ? "titleSpan" : "title";
}

function doneKey(props: ReopenClosureDialogProps): "doneSeriesEdit" | "doneSpan" | "done" {
  if (props.isSeriesEdit) return "doneSeriesEdit";
  return props.subjectIsSpan ? "doneSpan" : "done";
}

/** The dates of a bounded range a Manager can still reopen: today on, up to its last day. */
function reopenableDates(rule: DateRule, today: string): string[] {
  const dates: string[] = [];
  for (let d = rule.startsOn < today ? today : rule.startsOn; rule.endsOn && d <= rule.endsOn;) {
    dates.push(d);
    d = addDays(d, 1);
  }
  return dates;
}

function descriptionKey(
  props: ReopenClosureDialogProps,
  everyDateStaysClosed: boolean
):
  | "availabilitySpecial.reopen.descriptionSeriesEdit"
  | "availabilitySpecial.reopen.descriptionStillClosed"
  | "availabilitySpecial.reopen.descriptionCancelled"
  | "availabilitySpecial.reopen.description" {
  if (props.isSeriesEdit) return "availabilitySpecial.reopen.descriptionSeriesEdit";
  if (everyDateStaysClosed) return "availabilitySpecial.reopen.descriptionStillClosed";
  return (props.cancelled ?? 0) > 0
    ? "availabilitySpecial.reopen.descriptionCancelled"
    : "availabilitySpecial.reopen.description";
}

/**
 * Reopen a closure (ux.md F6 step 2). The guests it cancelled stay cancelled; the checkbox,
 * on by default, sends them the opt-in "we've reopened, rebook" notice.
 */
export function ReopenClosureDialog(props: ReopenClosureDialogProps) {
  const { venueId, ruleId, cancelled, editedDates = 0, isSeriesEdit, onClose } = props;
  const { t } = useTranslation();
  const { toast } = useToast();
  const offerUndo = useAvailabilityUndo();
  const { mutateAsync, isPending } = useReopenClosure();
  const refresh = useRefreshAvailability();
  // The guests a notice can still reach: their booking has not started. An older API does not
  // say, so every cancelled guest counts.
  const reachable = props.notifiable ?? cancelled ?? 0;
  const [tell, setTell] = useState(true);
  const [failure, setFailure] = useState<Failure | null>(null);
  const format = useVenueFormat();
  // One date of a range, or "" for all of it. Only a bounded range can give a date back.
  const [date, setDate] = useState("");
  const dates = props.canPickDate ? reopenableDates(props.rule, props.today) : [];
  const dateText = (d: string) =>
    format.formatCalendarDate(d, { weekday: "short", month: "short", day: "numeric" });
  const one = date !== "";
  const subject = one ? dateText(date) : props.subject;
  // What stays closed is judged for what is being reopened: the one date, or the whole rule.
  const reopening = one ? { ...props.rule, startsOn: date, endsOn: date } : props.rule;
  // A series edit has its own wording: the date goes back to the series, closed or not.
  const stays = isSeriesEdit
    ? NOTHING_STAYS
    : stillClosedAfterReopen(props.rules, reopening, props.today);
  const staysLines = (overlap: ClosureOverlap) =>
    overlapLines(overlap, "stays", props.services, t, format);

  const reopen = async () => {
    if (cancelled === null) return;
    setFailure(null);
    try {
      // A date handed back to the series, or shut by another closure, stays closed: its guests
      // are never told to rebook.
      const told = !isSeriesEdit && !stays.everyDate && reachable > 0 && tell;
      // What this screen read of the rule and its skips and edits: if a teammate changed them since,
      // the server refuses rather than delete their work.
      const seen = { rule: props.rule, children: props.rules.filter((r) => r.seriesId === ruleId) };
      const saved = await mutateAsync({
        venueId,
        ruleId,
        tellCancelledGuests: told,
        seen,
        ...(one ? { date } : {}),
      });
      // The server read the rules as it committed; the page's copy may be older.
      const final = isSeriesEdit ? NOTHING_STAYS : (saved.stillClosed ?? stays);
      const toldCount = saved.notified ?? 0;
      const done = final.everyDate
        ? t("availabilitySpecial.reopen.doneStillClosed", { date: subject })
        : one && toldCount > 0
          ? // The server's count of the guests on this date, not the range's.
            t("availabilitySpecial.reopen.doneTold", { date: subject, count: toldCount })
          : t(`availabilitySpecial.reopen.${one ? "done" : doneKey(props)}`, { date: subject });
      const title =
        final.by.length === 0
          ? done
          : t("availability.closureOverlap.doneAndStays", {
              done,
              stays: staysLines(final).join(" "),
            });
      // A reopen that told guests cannot be reverted (ux.md F6 step 3); one that told none can.
      // The server says how many it reached; an older one does not, and `told` stands in.
      const toldGuests = saved.notified == null ? told : saved.notified > 0;
      if (toldGuests) toast({ title, variant: "success" });
      else offerUndo({ venueId, title, saved });
      onClose();
    } catch (error) {
      // A 404 is a teammate's reopen that removed this closure first: the same stale dialog, and
      // retrying can only fail the same way, so it takes the same way out.
      const gone = (error as { statusCode?: number } | null)?.statusCode === 404;
      if (gone || conflictOf(error)?.code === "version-conflict") {
        // The closure changed under this dialog, whose copy of it is now stale: bring the page to
        // what is saved and close, so the next Reopen is built from the new one.
        refresh();
        toast({ title: t("availabilitySpecial.reopen.changed"), variant: "error" });
        onClose();
        return;
      }
      setFailure(failureOf(error, t));
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t(`availabilitySpecial.reopen.${one ? "title" : titleKey(props)}`, { date: subject })}
      description={
        one && !stays.everyDate
          ? t(
              (cancelled ?? 0) > 0
                ? "availabilitySpecial.reopen.descriptionDateCancelled"
                : "availabilitySpecial.reopen.descriptionDate",
              { date: subject }
            )
          : t(descriptionKey(props, stays.everyDate))
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t(
              isSeriesEdit
                ? "availabilitySpecial.reopen.keepSeriesEdit"
                : "availabilitySpecial.reopen.keep"
            )}
          </Button>
          <Button
            variant="primary"
            onClick={() => void reopen()}
            isLoading={isPending}
            disabled={cancelled === null}
          >
            {t(
              isSeriesEdit
                ? "availabilitySpecial.reopen.confirmSeriesEdit"
                : "availabilitySpecial.reopen.confirm"
            )}
          </Button>
        </>
      }
    >
      {failure && <Alert variant="error">{failure.text}</Alert>}
      {failure && <StrandedBookings reservations={failure.listed} />}
      {failure && failure.listed.length > 0 && failure.unlisted > 0 && (
        <Text>{t("availabilitySpecial.reopen.strandedMore", { count: failure.unlisted })}</Text>
      )}
      {dates.length > 1 && (
        <Select
          label={t("availabilitySpecial.reopen.dateLabel")}
          value={date}
          options={[
            { value: "", label: t("availabilitySpecial.reopen.allDates") },
            ...dates.map((d) => ({ value: d, label: dateText(d) })),
          ]}
          onChange={setDate}
        />
      )}
      {stays.by.length > 0 && (
        <Alert variant="warning">
          {staysLines(stays).map((line) => (
            <Text key={line}>{line}</Text>
          ))}
        </Alert>
      )}
      {cancelled === null && !props.countFailed && (
        <Text>{t("availabilitySpecial.reopen.countLoading")}</Text>
      )}
      {cancelled === null && props.countFailed && (
        <Alert variant="error">
          <Text>{t("availabilitySpecial.reopen.countUnknown")}</Text>
          <Button variant="secondary" onClick={props.onRetryCount}>
            {t("availabilitySpecial.reopen.retryCount")}
          </Button>
        </Alert>
      )}
      {editedDates > 0 && (
        <Text>{t("availabilitySpecial.reopen.editedDates", { count: editedDates })}</Text>
      )}
      {!isSeriesEdit && !stays.everyDate && cancelled !== null && reachable > 0 && (
        <Checkbox
          label={
            // The count is of the whole range; a single date's guests are counted by the server.
            one
              ? t("availabilitySpecial.reopen.tellDate", { date: subject })
              : t("availabilitySpecial.reopen.tell", { count: reachable })
          }
          checked={tell}
          onCheckedChange={setTell}
        />
      )}
    </Dialog>
  );
}
