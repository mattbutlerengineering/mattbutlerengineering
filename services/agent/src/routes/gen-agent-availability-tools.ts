import { randomUUID } from "node:crypto";
import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import type { AvailabilityConfig, DateRule, TonightChange } from "@mbe/types";
import {
  NO_VENUE,
  localTimeIn,
  refusalOf,
  resolveTable,
  todayIn,
  type ApiClient,
} from "./gen-tool-support.js";

/**
 * Chat tools for Tonight changes (ux.md F7) and undo. Every input is a flat
 * value, because the chat's confirm bar shows each one as text and what the
 * user confirms is what runs. Closures, special hours and schedules stay on
 * the Availability page.
 */

const TONIGHT_CHANGE_TYPES = [
  "pause_online",
  "close_early",
  "stop_window",
  "block_tables",
  "pacing",
] as const;
type TonightChangeType = (typeof TONIGHT_CHANGE_TYPES)[number];

const MINUTES_IN_DAY = 1440;
/** `MinuteSchema`'s top: a service day runs on a two-day minute scale (ADR-029). */
const MINUTES_IN_TWO_DAYS = 2880;
/** The reservations API's page-size ceiling; a venue's tables fit in one page. */
const TABLES_LIMIT = 100;

const AVAILABILITY_PAGE =
  "Tell the user to make this change on the Availability page in the dashboard.";

const ClockSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour venue-local time as HH:MM");

type ChangeField = "closeAt" | "from" | "to" | "service" | "tables" | "covers";
const CHANGE_FIELDS: readonly ChangeField[] = [
  "closeAt",
  "from",
  "to",
  "service",
  "tables",
  "covers",
];

/** The fields each change type takes, and which of them it needs. */
const FIELDS_BY_CHANGE: Record<
  TonightChangeType,
  { readonly allowed: readonly ChangeField[]; readonly required: readonly ChangeField[] }
> = {
  pause_online: { allowed: [], required: [] },
  close_early: { allowed: ["closeAt", "service"], required: ["closeAt"] },
  stop_window: { allowed: ["from", "to"], required: ["from", "to"] },
  block_tables: { allowed: ["tables", "from", "to"], required: ["tables"] },
  pacing: { allowed: ["covers"], required: ["covers"] },
};

const ChangeTonightInputSchema = z
  .object({
    change: z
      .enum(TONIGHT_CHANGE_TYPES)
      .describe(
        "pause_online stops online booking for tonight; close_early stops seating at closeAt; stop_window takes no bookings from..to; block_tables takes the tables out of booking (rest of tonight, or from..to); pacing caps covers per slot"
      ),
    closeAt: ClockSchema.optional().describe("close_early: last time, HH:MM venue-local"),
    from: ClockSchema.optional().describe("stop_window / block_tables: start, HH:MM"),
    to: ClockSchema.optional().describe("stop_window / block_tables: end, HH:MM"),
    service: z
      .string()
      .min(1)
      .optional()
      .describe("close_early: the one service to close early, by name; omit for every service"),
    tables: z
      .array(z.string().min(1))
      .min(1)
      .optional()
      .describe("block_tables: table names or numbers, as staff call them"),
    covers: z.number().int().min(1).optional().describe("pacing: covers per slot"),
  })
  .superRefine((input, ctx) => {
    const { allowed, required } = FIELDS_BY_CHANGE[input.change];
    for (const field of CHANGE_FIELDS) {
      const present = input[field] !== undefined;
      if (present && !allowed.includes(field)) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `${field} doesn't apply to ${input.change}`,
        });
      }
      if (!present && required.includes(field)) {
        ctx.addIssue({ code: "custom", path: [field], message: `${input.change} needs ${field}` });
      }
    }
  });

type ChangeTonightInput = z.infer<typeof ChangeTonightInputSchema>;
type TonightRule = Extract<DateRule, { kind: "tonight" }>;

function clockToMinute(clock: string): number {
  const [hours, minutes] = clock.split(":").map(Number);
  return hours! * 60 + minutes!;
}

/**
 * A wall-clock time on the service day's minute scale: a time before the
 * venue's earliest opening belongs to the night that started the day before
 * (01:00 after a late dinner is minute 1500).
 */
function serviceDayMinute(clock: string, config: AvailabilityConfig): number {
  const minute = clockToMinute(clock);
  const opens = config.scheduleServices.map((s) => s.opensAt);
  const earliest = opens.length ? Math.min(...opens) : 0;
  return minute < earliest ? minute + MINUTES_IN_DAY : minute;
}

function minuteToClock(minute: number): string {
  const wall = minute % MINUTES_IN_DAY;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(wall / 60))}:${pad(wall % 60)}`;
}

/** The Tonight rules still in force: unexpired, or for today when no end was stored. */
function activeTonightRules(config: AvailabilityConfig, today: string, now: Date): TonightRule[] {
  return config.dateRules.filter(
    (rule): rule is TonightRule =>
      rule.kind === "tonight" &&
      (rule.expiresAt ? Date.parse(rule.expiresAt) > now.getTime() : rule.startsOn === today)
  );
}

/** Same reading as the Availability page's Tonight chips (`tonight-state.ts`). */
function changeTypeOf(rule: TonightRule): TonightChangeType {
  const { payload } = rule;
  if ("closeAt" in payload) return "close_early";
  if ("pacing" in payload) return "pacing";
  if (rule.targetKind === "booking") return "pause_online";
  if (rule.targetKind === "tables") return "block_tables";
  return "stop_window";
}

/** A stop window as staff say it; "rest of tonight" (the whole scale) has no times. */
function stopTimes(stop: { from: number; to: number }) {
  return stop.from === 0 && stop.to === MINUTES_IN_TWO_DAYS
    ? {}
    : { from: minuteToClock(stop.from), to: minuteToClock(stop.to) };
}

function describeRule(
  rule: TonightRule,
  serviceName: (id: string) => string | undefined,
  tableName: (id: string) => string
) {
  const change = changeTypeOf(rule);
  const { payload } = rule;
  if ("closeAt" in payload) {
    const service = rule.venueServiceId ? serviceName(rule.venueServiceId) : undefined;
    return { change, closeAt: minuteToClock(payload.closeAt), ...(service ? { service } : {}) };
  }
  if ("pacing" in payload) return { change, covers: payload.pacing.covers };
  if (change === "pause_online") return { change };
  if (change === "block_tables") {
    return { change, tables: (rule.tableIds ?? []).map(tableName), ...stopTimes(payload.stop) };
  }
  return { change, ...stopTimes(payload.stop) };
}

/** `service` as a venue service id, by exact then case-insensitive name. */
function resolveService(
  config: AvailabilityConfig,
  name: string
): { id: string } | { error: string } {
  const live = config.venueServices.filter((s) => !s.archivedAt);
  const steps: ReadonlyArray<(s: (typeof live)[number]) => boolean> = [
    (s) => s.name === name.trim(),
    (s) => s.name.toLowerCase() === name.trim().toLowerCase(),
  ];
  for (const matches of steps) {
    const found = live.filter(matches);
    if (found.length === 1) return { id: found[0]!.id };
    if (found.length > 1) return { error: `More than one service is called ${name}. Ask which.` };
  }
  return {
    error: `This venue has no service called ${name}. Its services are ${live.map((s) => s.name).join(", ")}.`,
  };
}

async function resolveTableIds(
  api: ApiClient,
  venueId: string,
  refs: readonly string[]
): Promise<{ ids: string[] } | { error: string }> {
  const { data } = await api.tables.list({ venueId, limit: TABLES_LIMIT });
  const ids: string[] = [];
  for (const ref of refs) {
    const resolved = resolveTable(data, ref);
    if ("error" in resolved) return resolved;
    ids.push(resolved.table.id);
  }
  return { ids };
}

/** The API's Tonight change for a checked input, or why it can't be built. */
async function buildChange(
  input: ChangeTonightInput,
  config: AvailabilityConfig,
  api: ApiClient,
  venueId: string
): Promise<{ change: TonightChange } | { error: string }> {
  const minute = (clock: string) => serviceDayMinute(clock, config);
  const window =
    input.from && input.to ? { from: minute(input.from), to: minute(input.to) } : undefined;
  if (window && window.to <= window.from) {
    return { error: `The window must end after it starts (${input.from} to ${input.to}).` };
  }
  switch (input.change) {
    case "pause_online":
      return { change: { type: "pause_online" } };
    case "pacing":
      return { change: { type: "pacing", covers: input.covers! } };
    case "stop_window":
      return { change: { type: "stop_window", ...window! } };
    case "close_early": {
      if (!input.service)
        return { change: { type: "close_early", closeAt: minute(input.closeAt!) } };
      const service = resolveService(config, input.service);
      if ("error" in service) return service;
      return {
        change: {
          type: "close_early",
          closeAt: minute(input.closeAt!),
          venueServiceId: service.id,
        },
      };
    }
    case "block_tables": {
      const tables = await resolveTableIds(api, venueId, input.tables!);
      if ("error" in tables) return tables;
      return {
        change: {
          type: "block_tables",
          tableIds: tables.ids,
          ...(input.from ? { from: minute(input.from) } : {}),
          ...(input.to ? { to: minute(input.to) } : {}),
        },
      };
    }
  }
}

/** A refused availability write, in words the model can pass on. */
function availabilityWriteFailure(err: unknown, action: string) {
  const refusal = refusalOf(err);
  if (!refusal)
    return { error: `Couldn't ${action} right now. Ask the user to try again shortly.` };
  const base = { refused: true, ...(refusal.code ? { code: refusal.code } : {}) };
  switch (refusal.code ?? (refusal.status === 403 ? "forbidden" : undefined)) {
    case "decision-required":
      return {
        ...base,
        needsDecisions: true,
        error: `This affects existing bookings, and each one needs a decision (cancel, move or keep). ${AVAILABILITY_PAGE} Nothing was changed.`,
      };
    case "version-conflict":
      return {
        ...base,
        error:
          "Availability changed since it was read, so nothing was saved. Check the current Tonight changes and ask the user to confirm again.",
      };
    case "guests-notified":
      return {
        ...base,
        error: "That change already told guests, so it can't be undone. Nothing was changed.",
      };
    case "forbidden":
      return {
        ...base,
        error:
          "The user doesn't have permission to make this change. A manager can make it, or it can be done on the Availability page.",
      };
    default:
      return { ...base, error: `${refusal.detail} Nothing was changed.` };
  }
}

export function createAvailabilityTools(
  log: FastifyBaseLogger,
  api: ApiClient,
  {
    venueId,
    timeZone,
  }: { readonly venueId?: string | undefined; readonly timeZone?: string | undefined }
): ToolSet {
  /** The Tonight rules in force, with the config they came from. */
  async function readTonight() {
    const state = await api.availability.getConfig(venueId!);
    const rules = activeTonightRules(state.config, todayIn(timeZone), new Date());
    return { state, rules };
  }

  return {
    // ── Read ───────────────────────────────────────────────
    list_tonight_changes: tool({
      description:
        "List the Tonight changes in force (paused online booking, close early, stopped windows, blocked tables, pacing), and the newest availability change that can still be undone. Call it before ending or undoing a change.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "list_tonight_changes tool called");
        try {
          const { state, rules } = await readTonight();
          const needsTables = rules.some((r) => r.tableIds?.length);
          const tables = needsTables
            ? (await api.tables.list({ venueId, limit: TABLES_LIMIT })).data
            : [];
          const serviceName = (id: string) =>
            state.config.venueServices.find((s) => s.id === id)?.name;
          const tableName = (id: string) => {
            const table = tables.find((t) => t.id === id);
            return table?.name ?? table?.tableNumber ?? id;
          };
          const page = await api.availability.listChanges(venueId, { limit: 1 });
          const newest = page.items[0];
          return {
            changes: rules.map((rule) => describeRule(rule, serviceName, tableName)),
            undoable: newest?.revertible ? { summary: newest.summary, at: newest.at } : null,
          };
        } catch (err) {
          log.error({ err, venueId }, "list_tonight_changes failed");
          return { error: "Couldn't read tonight's availability. Ask the user to try again." };
        }
      },
    }),

    // ── Write (each runs only after the user confirms) ─────
    change_tonight_availability: tool({
      description:
        "Make one Tonight change for the venue's current service day; it ends on its own when the day does. Requires confirmation. For a closure, special hours or a schedule change on another day, point the user to the Availability page instead.",
      inputSchema: ChangeTonightInputSchema,
      execute: async (input) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId, change: input.change }, "change_tonight_availability tool called");
        try {
          const state = await api.availability.getConfig(venueId);
          const built = await buildChange(input, state.config, api, venueId);
          if ("error" in built) return built;
          const result = await api.availability.setTonight(venueId, {
            expectedVersion: state.version,
            ruleId: randomUUID(),
            change: built.change,
          });
          const until = localTimeIn(result.expiresAt, timeZone);
          return {
            applied: true,
            serviceDate: result.serviceDate,
            ...(until ? { until } : {}),
          };
        } catch (err) {
          log.error({ err, venueId, change: input.change }, "change_tonight_availability failed");
          return availabilityWriteFailure(err, "make the change");
        }
      },
    }),

    end_tonight_change: tool({
      description:
        "End a Tonight change early so its times or tables open again. Bookings a close-early cancelled stay cancelled. Requires confirmation.",
      inputSchema: z.object({
        change: z.enum(TONIGHT_CHANGE_TYPES).describe("The kind of Tonight change to end"),
        from: ClockSchema.optional().describe(
          "When several stop windows or table blocks are in force: the start of the one to end, HH:MM"
        ),
      }),
      execute: async ({ change, from }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId, change }, "end_tonight_change tool called");
        try {
          const { rules } = await readTonight();
          const ofKind = rules.filter((rule) => changeTypeOf(rule) === change);
          const matches = from
            ? ofKind.filter(
                (rule) => "stop" in rule.payload && minuteToClock(rule.payload.stop.from) === from
              )
            : ofKind;
          if (matches.length === 0) {
            return { error: `No ${change.replace(/_/g, " ")} change is in force tonight.` };
          }
          if (matches.length > 1) {
            return {
              error: `More than one ${change.replace(/_/g, " ")} change is in force. Ask which one, by its start time.`,
            };
          }
          await api.availability.endTonight(venueId, matches[0]!.id);
          return { ended: true, change };
        } catch (err) {
          log.error({ err, venueId, change }, "end_tonight_change failed");
          return availabilityWriteFailure(err, "end the change");
        }
      },
    }),

    undo_availability_change: tool({
      description:
        "Undo the newest availability change, when list_tonight_changes offers it as undoable. Pass its summary exactly as listed. A change that told guests can't be undone. Requires confirmation.",
      inputSchema: z.object({
        summary: z.string().min(1).describe("The undoable change's summary, copied exactly"),
      }),
      execute: async ({ summary }) => {
        if (!venueId) return NO_VENUE;
        log.info({ venueId }, "undo_availability_change tool called");
        try {
          const page = await api.availability.listChanges(venueId, { limit: 1 });
          const newest = page.items[0];
          if (!newest?.revertible) {
            return {
              error: "No availability change can be undone right now. Nothing was changed.",
            };
          }
          // The user confirmed this summary: undo only that change, never whatever is newest now.
          if (newest.summary !== summary) {
            return {
              error: `The newest change is now "${newest.summary}", not the one confirmed. Nothing was changed; ask the user again.`,
            };
          }
          const { version } = await api.availability.getConfig(venueId);
          await api.availability.revertChange(venueId, newest.id, version);
          return { undone: true, summary };
        } catch (err) {
          log.error({ err, venueId }, "undo_availability_change failed");
          return availabilityWriteFailure(err, "undo the change");
        }
      },
    }),
  };
}
