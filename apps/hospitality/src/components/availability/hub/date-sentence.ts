import { minuteText } from "../closure-band.js";
import { scheduleNameText } from "../day-summary.js";
import type { DateAnswer, DateAnswerRule } from "./date-answer.js";
import type { HubTextContext } from "./hub-text.js";

/**
 * The hub's date check in words (availability-hub ux.md, "Date sentence"): what happens on the
 * date, the rule that decided it, and at most one rule beneath it. Pure: no React.
 */

/** "Thu, Dec 24": the date as the sentence opens with it. */
function sentenceDate(date: string, { format }: HubTextContext): string {
  return format.formatCalendarDate(date, { weekday: "short", month: "short", day: "numeric" });
}

/** A rule in the Manager's words; seasonal hours go by their own name. */
function ruleText(rule: DateAnswerRule, { t }: HubTextContext): string {
  switch (rule.kind) {
    case "regular":
      return t("availabilityHub.dateCheck.rule.regular");
    case "seasonal":
      return scheduleNameText(rule.name, t);
    // "Same as another day" is a choice made on a special date.
    case "useHours":
    case "special":
      return t("availabilityHub.dateCheck.rule.special");
    case "closure":
      return t("availabilityHub.dateCheck.rule.closure");
    case "tonight":
      return t("availabilityHub.dateCheck.rule.tonight");
  }
}

/** "Dinner 4:00 PM–8:00 PM, closed from 6:00 PM", or "closed". */
function whatHappens(answer: DateAnswer, { t, format }: HubTextContext): string {
  const { services, closedBand: band } = answer;
  const closed = t("availabilityHub.dateCheck.closed");
  if (services.length === 0) return closed;
  const opens = Math.min(...services.map((s) => s.opensAt));
  const closes = Math.max(...services.map((s) => s.closesAt));
  if (band && band.from <= opens && band.to >= closes) return closed;
  const time = (minute: number) => minuteText(minute, t, format);
  const hours = services.map((s) =>
    t("availabilityHub.dateCheck.service", {
      name: s.name,
      hours: t("availability.serviceHours.range", {
        open: time(s.opensAt),
        close: time(s.closesAt),
      }),
    })
  );
  // A band outside the open hours changes nothing a guest can book, so it is not said.
  const cuts = band !== null && band.from < closes && band.to > opens;
  const closedPart = !cuts
    ? []
    : band.to >= closes
      ? [t("availabilityHub.dateCheck.closedFrom", { time: time(band.from) })]
      : [
          t("availabilityHub.dateCheck.closedBetween", {
            from: time(band.from),
            to: time(band.to),
          }),
        ];
  return new Intl.ListFormat(format.locale, { type: "unit" }).format([...hours, ...closedPart]);
}

/** The one sentence the date check reads for an answer. */
export function dateSentence(answer: DateAnswer, ctx: HubTextContext): string {
  const { t } = ctx;
  const date = sentenceDate(answer.date, ctx);
  if (answer.deciding === null) return t("availabilityHub.dateCheck.uncovered", { date });
  const values = { date, what: whatHappens(answer, ctx), rule: ruleText(answer.deciding, ctx) };
  return answer.beneath
    ? t("availabilityHub.dateCheck.sentenceOver", {
        ...values,
        beneath: ruleText(answer.beneath, ctx),
      })
    : t("availabilityHub.dateCheck.sentence", values);
}
