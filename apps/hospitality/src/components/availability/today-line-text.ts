import type { TFunction } from "i18next";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";
import { minuteText } from "./closure-band.js";
import type { BookingChannel, TodayItem, TodayLineModel } from "./today-line.js";
import { tonightChipText } from "./tonight-state.js";

type Format = Pick<VenueFormat, "formatLocalTime">;

const CHANNEL_ORDER: readonly BookingChannel[] = ["online", "phone", "waitlist"];

/** The channel sets the catalog words, in `CHANNEL_ORDER`, joined by "_". */
type PausedSet =
  BookingChannel | "online_phone" | "online_waitlist" | "phone_waitlist" | "online_phone_waitlist";

/** "Online and phone paused", "Phone paused from 6:30 PM": one catalog key per channel set. */
function channelSet(channels: readonly BookingChannel[]): PausedSet {
  return CHANNEL_ORDER.filter((channel) => channels.includes(channel)).join("_") as PausedSet;
}

function pausedText(
  item: Extract<TodayItem, { kind: "paused" }>,
  t: TFunction,
  format: Format
): string {
  const set = channelSet(item.channels);
  return item.from === null
    ? t(`availability.today.paused.${set}`)
    : t(`availability.today.pausedFrom.${set}`, { time: minuteText(item.from, t, format) });
}

/** One item's words; the Tonight kinds use the Timeline's chip wording. */
export function todayItemText(item: TodayItem, t: TFunction, format: Format): string {
  switch (item.kind) {
    case "serviceClosed":
      return t("availability.today.serviceClosed", { name: item.name });
    case "closingEarly":
      return item.name === null
        ? t("availability.today.closingEarly", { time: minuteText(item.at, t, format) })
        : t("availability.today.closingEarlyNamed", {
            name: item.name,
            time: minuteText(item.at, t, format),
          });
    case "closedBetween": {
      const range = { from: minuteText(item.from, t, format), to: minuteText(item.to, t, format) };
      return item.name === null
        ? t("availability.today.closedBetween", range)
        : t("availability.today.targetClosedBetween", { name: item.name, ...range });
    }
    case "paused":
      return pausedText(item, t, format);
    case "pausedBetween":
      return t(`availability.today.pausedBetween.${channelSet(item.channels)}`, {
        from: minuteText(item.from, t, format),
        to: minuteText(item.to, t, format),
      });
    case "tonight":
      return tonightChipText(item.change, t, format);
  }
}

/** "Lunch 11:30 AM–3:00 PM · Dinner 5:00 PM–10:00 PM", or "Closed". */
export function hoursText(model: TodayLineModel, t: TFunction, format: Format): string {
  if (model.closed) return t("availability.today.closed");
  return model.hours
    .map((h) =>
      t("availability.today.hours", {
        name: h.name,
        from: minuteText(h.opensAt, t, format),
        to: minuteText(h.closesAt, t, format),
      })
    )
    .join(" · ");
}
