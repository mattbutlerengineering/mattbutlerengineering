import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Fitness guard for the reservation event log (proposal #6894, part 8).
 *
 * Every reservation mutation and every deposit status CAS must write a
 * `recordReservationEvent(` in the same function body, or be listed in
 * {@link ALLOWLIST} with a written reason. A future `reservation.update*`
 * call site that skips the event fails the ordinary `test` job. A stale
 * allowlist entry fails too, mirroring `PENDING_FORCE_TABLES`.
 */
const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const SITE_RE =
  /\b(\w+)\.(reservation\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)|deposit\.updateMany)\(/g;

interface AllowlistEntry {
  /** Path relative to `src/`. */
  file: string;
  /** Receiver and call, as written at the site. */
  site: string;
  reason: string;
}

const ALLOWLIST: AllowlistEntry[] = [
  {
    file: "services/post-visit-notifier.ts",
    site: "prisma.reservation.update",
    reason: "`emailStatus` bookkeeping update, not a reservation state change",
  },
  {
    file: "services/deposit.ts",
    site: "prisma.deposit.updateMany",
    reason: "`recordPostCaptureRefund` annotates `postCaptureRefundCents`, not a status transition",
  },
];

/** Replaces comments with spaces (offsets and newlines preserved). */
function blankComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

/**
 * Start/end offsets of the innermost function-like block enclosing `index`:
 * a `{` whose header contains `=>` or `function`, or ends in `)` / `): Type`
 * that is not a control-flow statement.
 */
function enclosingFunctionBody(source: string, index: number): [number, number] {
  let depth = 0;
  for (let i = index; i >= 0; i--) {
    const ch = source[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      if (depth > 0) {
        depth--;
        continue;
      }
      const header =
        source
          .slice(Math.max(0, i - 300), i)
          .split(/[;{}]/)
          .pop() ?? "";
      const isControlFlow = /\b(if|for|while|switch|catch|try|else|do)\b[^=]*$/.test(
        header.replace(/=>[\s\S]*$/, "=>")
      );
      const isFunction =
        /=>\s*$/.test(header) ||
        /\bfunction\b/.test(header) ||
        (endsWithParams(header) && !isControlFlow);
      if (isFunction) return [i, closingBrace(source, i)];
    }
  }
  return [0, source.length];
}

/** True for `...)` or `...): ReturnType` (a method or function signature). */
function endsWithParams(header: string): boolean {
  const trimmed = header.trimEnd();
  const close = trimmed.lastIndexOf(")");
  if (close === -1) return false;
  const tail = trimmed.slice(close + 1).trim();
  return tail === "" || (tail.startsWith(":") && !/[={)]/.test(tail));
}

function closingBrace(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return i;
  }
  return source.length;
}

/** `receiver.model.method` for each mutation site whose function body records no event. */
function unEventedSites(source: string): string[] {
  const code = blankComments(source);
  const flagged: string[] = [];
  for (const match of code.matchAll(SITE_RE)) {
    const [start, end] = enclosingFunctionBody(code, match.index ?? 0);
    if (!code.slice(start, end).includes("recordReservationEvent(")) {
      flagged.push(`${match[1]}.${match[2]}`);
    }
  }
  return flagged;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(path);
    return entry.name.endsWith(".ts") && !/\.test\.ts$/.test(entry.name) ? [path] : [];
  });
}

describe("unEventedSites", () => {
  it("flags a reservation update with no recordReservationEvent in its function", () => {
    const src = `async function move() { await prisma.$transaction(async (tx) => { await tx.reservation.update({ where: { id } }); }); }`;
    expect(unEventedSites(src)).toEqual(["tx.reservation.update"]);
  });

  it("flags an un-evented deposit status CAS", () => {
    expect(unEventedSites(`async function cas() { await tx.deposit.updateMany({}); }`)).toEqual([
      "tx.deposit.updateMany",
    ]);
  });

  it("passes a site whose function also records an event", () => {
    const src = `async function ok() { await tx.reservation.update({}); await recordReservationEvent(tx, {}); }`;
    expect(unEventedSites(src)).toEqual([]);
  });

  it("does not credit an event recorded in a different function", () => {
    const src = `async function a() { await tx.reservation.create({}); }\nasync function b() { await recordReservationEvent(tx, {}); }`;
    expect(unEventedSites(src)).toEqual(["tx.reservation.create"]);
  });

  it("ignores mentions in comments", () => {
    expect(
      unEventedSites(`// call tx.reservation.update(...)\n/* prisma.deposit.updateMany( */`)
    ).toEqual([]);
  });
});

describe("reservation event coverage", () => {
  const found = sourceFiles(srcDir).flatMap((path) => {
    const file = relative(srcDir, path).split("\\").join("/");
    return unEventedSites(readFileSync(path, "utf8")).map((site) => ({ file, site }));
  });
  const allowed = (s: { file: string; site: string }) =>
    ALLOWLIST.some((a) => a.file === s.file && a.site === s.site);

  it("every reservation/deposit mutation records an event or is allowlisted", () => {
    expect(found.filter((s) => !allowed(s))).toEqual([]);
  });

  it("has no stale allowlist entries", () => {
    const stale = ALLOWLIST.filter(
      (a) => !found.some((s) => s.file === a.file && s.site === a.site)
    );
    expect(stale).toEqual([]);
  });
});
