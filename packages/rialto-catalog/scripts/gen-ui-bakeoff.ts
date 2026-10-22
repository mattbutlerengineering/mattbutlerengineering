/**
 * Generative-UI model bake-off (#6948). Runs ~20 fixed prompts through Claude
 * Haiku 5.5, GPT-6 Luna and Gemini 3.1 Flash-Lite against the real rialto
 * catalog, validating each output with the catalog's own validator.
 *
 *   pnpm --dir packages/rialto-catalog bakeoff -- --dry-run
 *   ANTHROPIC_API_KEY=… OPENAI_API_KEY=… GEMINI_API_KEY=… \
 *     pnpm --dir packages/rialto-catalog bakeoff -- --max-usd 1 --out bakeoff.json
 *
 * Each provider runs once per `--efforts` arm (default `default,low`); the spend
 * guard prices every call, so more arms never raise the --max-usd ceiling.
 * Pass `--gemini-free-tier` when the Gemini key has no billing account linked.
 *
 * Keys are read from env only and never printed. With no keys (or --dry-run)
 * a stub provider is used and nothing leaves the machine.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  createStubProvider,
  formatTable,
  geminiPricing,
  runBakeoff,
  summarize,
  type Effort,
  type Provider,
  type ProviderId,
} from "./gen-ui-bakeoff-lib.ts";
import { ENV_KEYS, createProvider } from "./gen-ui-bakeoff-providers.ts";

const IDS: readonly ProviderId[] = ["anthropic", "openai", "gemini"];
const DEFAULT_MAX_USD = 1;

function loadPrompts(limit: number | undefined): string[] {
  const url = new URL("./fixtures/gen-ui-bakeoff-prompts.json", import.meta.url);
  const all = JSON.parse(readFileSync(url, "utf8")) as string[];
  return limit === undefined ? all : all.slice(0, limit);
}

function resolveProviders(
  ids: readonly ProviderId[],
  dryRun: boolean,
  prompts: string[],
  geminiFree: boolean
): Provider[] {
  if (dryRun)
    return ids.map((id) => ({
      ...createStubProvider({ id, prompts }),
      ...(id === "gemini" ? { pricing: geminiPricing(geminiFree) } : {}),
    }));
  const providers: Provider[] = [];
  for (const id of ids) {
    const key = process.env[ENV_KEYS[id]];
    if (!key) {
      console.error(`skip ${id}: ${ENV_KEYS[id]} is not set`);
      continue;
    }
    providers.push(
      id === "gemini"
        ? createProvider(id, key, fetch, undefined, geminiPricing(geminiFree))
        : createProvider(id, key)
    );
  }
  return providers;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    // pnpm forwards a literal `--` before script args; drop it so flags still parse.
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: {
      "dry-run": { type: "boolean", default: false },
      "max-usd": { type: "string", default: String(DEFAULT_MAX_USD) },
      out: { type: "string" },
      providers: { type: "string" },
      limit: { type: "string" },
      efforts: { type: "string", default: "default,low" },
      "gemini-free-tier": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  const maxUsd = Number(values["max-usd"]);
  if (!Number.isFinite(maxUsd) || maxUsd < 0) {
    console.error("--max-usd must be a non-negative number");
    return 2;
  }
  const ids = values.providers
    ? values.providers.split(",").filter((p): p is ProviderId => IDS.includes(p as ProviderId))
    : IDS;
  const efforts = values.efforts
    .split(",")
    .filter((e): e is Effort => e === "default" || e === "low");
  if (efforts.length === 0) {
    console.error("--efforts must include default and/or low");
    return 2;
  }
  const prompts = loadPrompts(values.limit ? Number(values.limit) : undefined);
  const anyKey = IDS.some((id) => process.env[ENV_KEYS[id]]);
  const dryRun = values["dry-run"] || !anyKey;
  if (dryRun && !values["dry-run"])
    console.error("no provider keys found — running --dry-run with stubs");

  const providers = resolveProviders(ids, dryRun, prompts, values["gemini-free-tier"]);
  if (providers.length === 0) {
    console.error("no providers to run");
    return 2;
  }
  const report = await runBakeoff({ providers, prompts, maxUsd, efforts });
  const summaries = summarize(report.results);
  process.stdout.write(
    `${dryRun ? "DRY RUN (stub providers, canned outputs)\n\n" : ""}${formatTable(summaries)}\n`
  );
  process.stdout.write(
    `\nspent $${report.spentUsd.toFixed(4)} of $${maxUsd.toFixed(2)} cap${report.aborted ? ` — ABORTED: ${report.abortReason}` : ""}\n`
  );
  if (values.out) {
    const models = Object.fromEntries(providers.map((p) => [p.id, p.model]));
    const json = { generatedAt: new Date().toISOString(), dryRun, models, summaries, ...report };
    writeFileSync(values.out, `${JSON.stringify(json, null, 2)}\n`);
  }
  return report.aborted ? 1 : 0;
}

process.exitCode = await main();
