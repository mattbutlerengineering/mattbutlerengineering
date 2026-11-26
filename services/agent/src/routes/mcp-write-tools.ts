import type { FastifyBaseLogger } from "fastify";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createAgentTools } from "./gen-agent-tools.js";
import {
  TablesField,
  UntilField,
  checkUntil,
  findTablePause,
  namedTableIds,
  tablePauseRule,
} from "./gen-agent-pause-tools.js";
import {
  CHECK_FAILED,
  affectedResult,
  closureFailure,
  spanText,
} from "./gen-agent-closure-support.js";
import { refusalOf, todayIn, type ApiClient } from "./gen-tool-support.js";
import { signConfirm, verifyConfirm } from "./mcp-confirm.js";

/**
 * MCP write tools (#9781). They exist only for a write-scoped personal access
 * token. Each is two calls: the first writes nothing and returns a preview and a
 * signed `confirmToken`; the second, with that token, runs exactly the input the
 * token carries (re-sent arguments are ignored) through the chat's own tool, so
 * the two surfaces cannot drift. The reservations service enforces what a token
 * may write (#9778) and audits each write (#9780).
 */
const WRITE_TOOL_NAMES = ["modify_reservation", "pause_tables", "resume_tables"] as const;
type WriteToolName = (typeof WRITE_TOOL_NAMES)[number];

/** Builds the reservations client for the presented token, with extra headers on every call. */
export type WriteApiFactory = (headers: Record<string, string>) => ApiClient;

interface Ctx {
  readonly api: ApiClient;
  readonly venueId: string;
  readonly timeZone: string;
}

type Input = Record<string, unknown>;
type Preview = { readonly preview: Record<string, unknown> } | { readonly error: string };

interface WriteTool {
  readonly description: string;
  readonly shape: z.ZodRawShape;
  /** Reads, never writes. `input` is what the token will carry. */
  readonly preview: (ctx: Ctx, input: Input) => Promise<Preview>;
  /** The write, run as the chat tool with `api`, whose writes carry the audit headers. */
  readonly writeApi: (toolApi: ApiClient, writer: ApiClient) => ApiClient;
}

const CONFIRM_NOTE =
  "Show the user the preview and ask whether to go ahead. Only after they say yes, call this tool again with the same arguments plus the confirmToken. Never confirm on your own.";

const MOVE_FIELDS = {
  reservationId: z.string().min(1).max(64).describe("The reservation to move"),
  date: z.string().optional().describe("New date in YYYY-MM-DD format"),
  startTime: z.string().optional().describe("New start time in HH:MM format"),
  endTime: z.string().optional().describe("New end time in HH:MM format"),
  partySize: z.number().int().positive().optional().describe("New party size"),
  tableId: z.string().optional().describe("New table ID"),
} satisfies z.ZodRawShape;

const MOVE_KEYS = ["date", "startTime", "endTime", "partySize", "tableId"] as const;

const failure = (err: unknown, what: string): { error: string } => {
  const refusal = refusalOf(err);
  return { error: refusal?.detail ?? `Couldn't ${what} right now. Nothing was changed.` };
};

async function previewModify({ api }: Ctx, input: Input): Promise<Preview> {
  const changes = Object.fromEntries(
    MOVE_KEYS.filter((k) => input[k] !== undefined).map((k) => [k, input[k]])
  );
  if (Object.keys(changes).length === 0) {
    return { error: "Say what to change: date, startTime, endTime, tableId or partySize." };
  }
  try {
    const r = await api.reservations.get(String(input["reservationId"]));
    return {
      preview: {
        action: "Move a booking",
        reservationId: r.id,
        guestName: r.guestName,
        current: {
          startTime: r.startTime,
          endTime: r.endTime,
          partySize: r.partySize,
          tableId: r.tableId,
        },
        changes,
      },
    };
  } catch (err) {
    return failure(err, "read the reservation");
  }
}

async function previewPause({ api, venueId, timeZone }: Ctx, input: Input): Promise<Preview> {
  const today = todayIn(timeZone);
  const end = checkUntil(String(input["until"]), today);
  if ("error" in end) return end;
  try {
    const named = await namedTableIds(api, venueId, input["tables"] as string[]);
    if ("error" in named) return named;
    const impact = await api.availability.getClosureImpact(
      venueId,
      tablePauseRule(named.ids, today, end.endsOn)
    );
    if (typeof impact?.reservations !== "number" || !Array.isArray(impact.groups)) {
      return { error: CHECK_FAILED };
    }
    if (impact.reservations > 0 || impact.groups.length > 0) return affectedResult(impact);
    return {
      preview: {
        action: "Pause tables",
        tables: named.names,
        from: today,
        until: end.endsOn ?? "until resumed",
        bookingsAffected: 0,
        note: "Nothing can be booked on these tables until they are resumed. No existing booking is touched.",
      },
    };
  } catch (err) {
    return closureFailure(err, "Couldn't check the pause right now. Nothing was changed.");
  }
}

async function previewResume({ api, venueId, timeZone }: Ctx, input: Input): Promise<Preview> {
  try {
    const found = await findTablePause(api, venueId, input["tables"] as string[], timeZone);
    if ("error" in found) return found;
    return {
      preview: {
        action: "Resume tables",
        tables: found.named.names,
        endsPause: spanText(found.rule),
        note: "Reopens the whole pause for booking. No guest is told.",
      },
    };
  } catch (err) {
    return closureFailure(err, "Couldn't read the pauses. Nothing was changed.");
  }
}

/** The pause save is preceded by an impact read, which is audited but must not spend the nonce. */
const pauseWriter = (toolApi: ApiClient, writer: ApiClient): ApiClient => ({
  ...toolApi,
  availability: Object.create(toolApi.availability, {
    createClosure: { value: writer.availability.createClosure.bind(writer.availability) },
  }) as ApiClient["availability"],
});

const TOOLS: Readonly<Record<WriteToolName, WriteTool>> = {
  modify_reservation: {
    description:
      "Move an existing booking: its date, start or end time, table or party size (nothing else can be changed). Two steps: the first call changes nothing and returns a preview and a confirmToken. " +
      CONFIRM_NOTE,
    shape: MOVE_FIELDS,
    preview: previewModify,
    writeApi: (_toolApi, writer) => writer,
  },
  pause_tables: {
    description:
      "Take tables out of booking from today until a date or until resumed (a table pause). It refuses when a booking sits on those tables. Two steps: the first call changes nothing and returns a preview with the bookings affected and a confirmToken. " +
      CONFIRM_NOTE,
    shape: { tables: TablesField, until: UntilField },
    preview: previewPause,
    writeApi: pauseWriter,
  },
  resume_tables: {
    description:
      "Put paused tables back into booking: ends the table pause that holds exactly these tables, telling no guest. This undoes pause_tables. Two steps: the first call changes nothing and returns a preview and a confirmToken. " +
      CONFIRM_NOTE,
    shape: { tables: TablesField },
    preview: previewResume,
    writeApi: (_toolApi, writer) => writer,
  },
};

const json = (value: unknown, isError = false) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  ...(isError ? { isError } : {}),
});

const REFUSED: Record<"invalid" | "expired", string> = {
  invalid:
    "That confirmToken isn't valid for this tool and venue. Nothing was changed. Start again without it.",
  expired: "That confirmToken has expired. Nothing was changed. Start again without it.",
};

export interface WriteToolDeps {
  /** The presented access token: the HMAC key. Never logged or returned. */
  readonly accessToken: string;
  readonly createApi: WriteApiFactory;
  /** The same client the read tools use, to check venue membership. */
  readonly api: ApiClient;
  readonly log: FastifyBaseLogger;
}

async function execute(
  name: WriteToolName,
  deps: WriteToolDeps,
  ctx: Ctx,
  input: Input,
  nonce: string
) {
  const toolApi = deps.createApi({ "Mbe-Tool": name });
  const writer = deps.createApi({ "Mbe-Tool": name, "Mbe-Confirm-Nonce": nonce });
  const api = TOOLS[name].writeApi(toolApi, writer);
  // The chat's gate runs a write only for the confirmed action, with exactly that input.
  const run = createAgentTools(deps.log, api, {
    venueId: ctx.venueId,
    timeZone: ctx.timeZone,
    confirmedAction: { actionId: nonce, toolName: name, toolInput: input },
  })[name]?.execute as ((i: unknown, o: unknown) => Promise<Record<string, unknown>>) | undefined;
  const result = await run?.(input, {
    toolCallId: `mcp-${name}`,
    messages: [],
    context: undefined,
  });
  if (!result) return json({ error: "That tool isn't available." }, true);
  return json(result, "error" in result);
}

async function handle(name: WriteToolName, deps: WriteToolDeps, args: Record<string, unknown>) {
  const { venueId, confirmToken, ...fields } = args as {
    venueId: string;
    confirmToken?: string;
  } & Input;
  let timeZone: string;
  try {
    timeZone = (await deps.api.venues.get(venueId)).ianaTimezone;
  } catch (err) {
    return json(failure(err, "reach the venue"), true);
  }
  const ctx: Ctx = { api: deps.createApi({ "Mbe-Tool": name }), venueId, timeZone };

  if (confirmToken !== undefined) {
    const verdict = verifyConfirm(deps.accessToken, confirmToken, name, venueId);
    if (!verdict.ok) return json({ error: REFUSED[verdict.reason] }, true);
    return execute(name, deps, ctx, verdict.input, verdict.nonce);
  }

  const input = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  const result = await TOOLS[name].preview(ctx, input);
  if ("error" in result) return json({ ...result, nothingChanged: true }, true);
  const { confirmToken: token, expiresAt } = signConfirm(deps.accessToken, {
    tool: name,
    venueId,
    input,
  });
  return json({
    status: "preview",
    preview: result.preview,
    confirmToken: token,
    expiresAt: new Date(expiresAt).toISOString(),
    next: CONFIRM_NOTE,
  });
}

/** Registers the three write tools; call only for a write-scoped token. */
export function registerWriteTools(server: McpServer, deps: WriteToolDeps): void {
  for (const name of WRITE_TOOL_NAMES) {
    const tool = TOOLS[name];
    server.registerTool(
      name,
      {
        description: `${tool.description} Takes the venueId from list_venues.`,
        inputSchema: z
          .object({
            venueId: z.string().min(1).max(64),
            ...tool.shape,
            confirmToken: z.string().max(4096).optional(),
          })
          .strict(),
        annotations: { readOnlyHint: false, destructiveHint: true },
      },
      async (args: Record<string, unknown>) => handle(name, deps, args)
    );
  }
}
