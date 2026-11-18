/**
 * Zod 4 probes `new Function("")` the first time an object schema is created.
 * The throw is caught, but the production CSP (script-src, no 'unsafe-eval')
 * still reports it. Chrome shows that as an eval violation on /hospitality,
 * because the entry chunk builds @mbe/types object schemas on every load.
 *
 * Setting `z.config({ jitless: true })` from an app import does not reach the
 * production bundle in time: Rolldown inlines that call into the entry body,
 * which runs after the schema chunk has already probed. The flag has to be on
 * `globalThis` before Zod evaluates. index.html does that from a classic
 * script, which runs during parse, before the deferred module entry.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const INDEX_HTML = resolve(APP, "index.html");

const PRELUDE = "globalThis.__zod_globalConfig = { jitless: true };";

function emptyFunctionProbes(setJitlessFirst: boolean): number {
  const prelude = setJitlessFirst ? `${PRELUDE}\n` : "";
  const script = `
const calls = [];
const Original = globalThis.Function;
function Watched(...args) {
  if (args.length === 1 && args[0] === "") calls.push("empty");
  if (new.target) return Reflect.construct(Original, args, new.target);
  return Original(...args);
}
Watched.prototype = Original.prototype;
Object.setPrototypeOf(Watched, Original);
globalThis.Function = Watched;
${prelude}
const { z } = await import("zod");
z.object({ name: z.string() });
process.stdout.write(String(calls.length));
`;
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", script],
    { cwd: APP, encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(
      `probe exited ${result.status}\n${result.stderr ?? ""}\n${result.stdout ?? ""}`
    );
  }
  return Number(result.stdout);
}

/**
 * Bodies of classic (parser-blocking) scripts. A module, defer, or async
 * script can run after the entry module, which is too late for the flag.
 *
 * Tag names are case-insensitive, and an end tag may have whitespace or junk
 * before `>` (`</script >`, `</script\t\n bar>`). A regexp that only accepts
 * `</script>` misses those, which is the CodeQL bad-tag-filter finding.
 */
function classicScripts(html: string): string[] {
  const lower = html.toLowerCase();
  const bodies: string[] = [];
  let from = 0;
  while (from < html.length) {
    const open = lower.indexOf("<script", from);
    if (open === -1) break;
    const afterName = open + "<script".length;
    const boundary = lower[afterName];
    if (boundary !== undefined && /[a-z0-9]/.test(boundary)) {
      from = afterName;
      continue;
    }
    const openEnd = lower.indexOf(">", afterName);
    if (openEnd === -1) break;
    const attrs = html.slice(afterName, openEnd);
    const close = lower.indexOf("</script", openEnd + 1);
    if (close === -1) break;
    const closeEnd = lower.indexOf(">", close + "</script".length);
    if (closeEnd === -1) break;
    const isModule = /\btype\s*=\s*["']module["']/i.test(attrs);
    const isDeferred = /\b(?:defer|async)\b/i.test(attrs);
    if (!isModule && !isDeferred) bodies.push(html.slice(openEnd + 1, close));
    from = closeEnd + 1;
  }
  return bodies;
}

describe("hospitality zod CSP", () => {
  it("an object schema probes Function when jitless is not set", () => {
    expect(emptyFunctionProbes(false)).toBeGreaterThan(0);
  });

  it("does not probe Function when __zod_globalConfig.jitless is set first", () => {
    expect(emptyFunctionProbes(true)).toBe(0);
  });

  it("sets jitless from a parser-blocking script before any module runs", () => {
    const html = readFileSync(INDEX_HTML, "utf8");
    const blocking = classicScripts(html).filter((body) => body.includes(PRELUDE));
    expect(blocking).toHaveLength(1);
  });

  it("closes on a spaced or messy end tag, and skips module and defer", () => {
    const html = [
      `<SCRIPT>\n${PRELUDE}\n</SCRIPT >`,
      `<SCRIPT type="module">module-body</SCRIPT>`,
      `<SCRIPT defer>defer-body</script\t\n bar>`,
    ].join("\n");
    expect(classicScripts(html)).toEqual([`\n${PRELUDE}\n`]);
  });
});
