import { useTranslation } from "react-i18next";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { serviceCloseChangeText, serviceHoursText } from "../availability/service-hours.js";
import { useWeekdaySummary } from "../availability/ScheduleFormParts.js";
import type { ClosureTarget, NodeState, SetupAction, SetupNode } from "./setup-tree.js";

export interface SetupNodeText {
  /** The kind's word ("Schedule", "Section"), for nodes that carry a name. */
  readonly caption: (node: SetupNode) => string | null;
  readonly label: (node: SetupNode) => string;
  /** One line on what the resource is, on the top-level nodes. */
  readonly whatIs: (node: SetupNode) => string | null;
  readonly state: (node: SetupNode) => string;
  readonly actionLabel: (action: SetupAction, node: SetupNode) => string;
  /** The target an action names, read after its visible label ("Close for a date… Bar"). */
  readonly actionSubject: (action: SetupAction) => string | undefined;
}

/** The words the hub says for a node, in the venue's locale (glossary in ux.md). */
export function useSetupNodeText(): SetupNodeText {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const summarize = useWeekdaySummary();

  const day = (date: string) =>
    format.formatCalendarDate(date, { weekday: "short", month: "short", day: "numeric" });
  const shortDay = (date: string) =>
    format.formatCalendarDate(date, { month: "short", day: "numeric" });

  const target = (value: ClosureTarget): string => {
    switch (value.kind) {
      case "venue":
        return t("setup.hub.target.venue");
      case "service":
        return value.name ?? t("setup.hub.target.service");
      case "section":
        return value.name ?? t("setup.hub.target.section");
      case "booking":
        return new Intl.ListFormat(format.locale, { type: "conjunction" }).format(
          value.bookingTypes.map((b) => t(`setup.hub.channel.${b}`))
        );
      case "tables":
        return t("setup.hub.target.tables", { count: value.count });
    }
  };

  const when = (startsOn: string, endsOn: string | null): string => {
    if (endsOn === startsOn) return day(startsOn);
    if (endsOn === null) return t("setup.hub.from", { date: day(startsOn) });
    return t("setup.hub.range", { from: shortDay(startsOn), to: shortDay(endsOn) });
  };

  const state = (node: SetupNode): string => {
    const value: NodeState = node.state;
    switch (value.kind) {
      case "unset":
        return t("setup.hub.notSetUp");
      case "count":
        switch (node.kind) {
          case "schedules":
            return t("setup.hub.count.schedules", { count: value.count });
          case "specialDates":
            return t("setup.hub.count.specialDates", { count: value.count });
          default:
            return t("setup.hub.count.channel", { count: value.count });
        }
      case "week":
        return t("setup.hub.open", { days: summarize(value.weekdays) });
      case "period":
        return t("setup.hub.period", {
          range:
            value.startsOn === null
              ? t("setup.hub.until", { date: shortDay(value.endsOn ?? "") })
              : when(value.startsOn, value.endsOn),
          days: summarize(value.weekdays),
        });
      case "service": {
        const ctx = { t, format };
        const base = t("setup.hub.serviceLine", {
          hours: serviceHoursText(value, ctx),
          days: summarize(value.weekdays),
        });
        const changes = value.changes.map((c) =>
          c.opensAt === value.opensAt
            ? serviceCloseChangeText(summarize(c.weekdays), c, ctx)
            : t("availability.regularWeekLine.different", {
                days: summarize(c.weekdays),
                hours: serviceHoursText(c, ctx),
              })
        );
        return [base, ...changes].join(" · ");
      }
      case "rules": {
        const parts = [
          value.daysAhead !== null && t("setup.hub.rules.daysAhead", { count: value.daysAhead }),
          value.noticeHours !== null &&
            t("setup.hub.rules.noticeHours", { count: value.noticeHours }),
          value.largestParty !== null &&
            t("setup.hub.rules.largestParty", { count: value.largestParty }),
        ].filter((part): part is string => part !== false);
        return parts.join(" · ");
      }
      case "closure": {
        const what = t(
          value.what === "closed" ? "setup.hub.closedRow" : "setup.hub.specialHoursRow",
          {
            target: target(value.target),
          }
        );
        return `${when(value.startsOn, value.endsOn)} · ${what}`;
      }
      case "floorPlan":
        return `${t("setup.hub.sections", { count: value.sections })} · ${t("setup.hub.tables", { count: value.tables })}`;
      case "tables":
        return t("setup.hub.tables", { count: value.count });
      case "seats":
        return t("setup.hub.seats", { count: value.seats });
    }
  };

  return {
    caption: (node) => {
      if (node.name === null) return null;
      switch (node.kind) {
        case "schedule":
          return t("setup.hub.caption.schedule");
        case "service":
          return t("setup.hub.caption.service");
        case "section":
          return t("setup.hub.caption.section");
        case "table":
          return t("setup.hub.caption.table");
        case "floorPlan":
          return t("setup.hub.caption.floorPlan");
        default:
          return null;
      }
    },
    label: (node) => {
      if (node.kind === "channel")
        return t(
          `setup.hub.channelLabel.${node.name === "phone" || node.name === "waitlist" ? node.name : "online"}`
        );
      if (node.name !== null) return node.name;
      switch (node.kind) {
        case "schedules":
          return node.state.kind === "unset"
            ? t("setup.hub.regularWeek")
            : t("setup.hub.label.schedules");
        case "specialDates":
          return t("setup.hub.label.specialDates");
        case "booking":
          return t("setup.hub.label.booking");
        case "noSection":
          return t("setup.hub.label.noSection");
        default:
          return t("setup.hub.label.floorPlan");
      }
    },
    whatIs: (node) => {
      const unset = node.state.kind === "unset";
      switch (node.kind) {
        case "schedules":
          return t(unset ? "setup.hub.what.regularWeek" : "setup.hub.what.schedules");
        case "specialDates":
          return t("setup.hub.what.specialDates");
        case "booking":
          return t(unset ? "setup.hub.what.bookingUnset" : "setup.hub.what.booking");
        case "floorPlan":
          return unset ? t("setup.hub.what.floorPlan") : null;
        default:
          return null;
      }
    },
    state,
    actionLabel: (action, node) =>
      action.id === "addFloorPlan" && node.state.kind !== "unset"
        ? t("setup.hub.actions.addAnotherFloorPlan")
        : t(`setup.hub.actions.${action.id}`),
    actionSubject: (action) => action.subject,
  };
}
