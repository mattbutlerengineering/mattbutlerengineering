#!/usr/bin/env node

/**
 * sentry-heartbeat.mjs — daily proof that every in-scope Sentry project is
 * still ingesting events raised INSIDE the deployed artifacts.
 *
 * Silence in Sentry looks exactly like health. This script makes each deployed
 * artifact raise one marked event (backend: the deliberate 429 from
 * sentry-round-trip.mjs; static sites: an uncaught throw inside the live page,
 * captured by the bundle's own SDK), then asks the Sentry API whether the
 * marker arrived in the project it is expected in.
 *
 * Everything above the c8-ignored CLI block is a pure decision or an
 * injectable seam, unit-tested in scripts/__tests__/sentry-heartbeat.test.mjs.
 * See docs/features/sentry-silence-alert/architecture.md.
 */

import {
  buildRoundTripMarker,
  eventMatchesMarker,
  nextPollDelayMs,
  shouldKeepPolling,
} from "./sentry-round-trip.mjs";

/** @param {unknown} event @returns {Array<{ key?: string, value?: string }>} */
function tagsOf(event) {
  return Array.isArray(event?.tags) ? event.tags : [];
}

/** @param {unknown} event @param {string} key */
function tagValue(event, key) {
  return tagsOf(event).find((tag) => tag?.key === key)?.value;
}

/** @param {unknown} value @param {string} marker */
const contains = (value, marker) => typeof value === "string" && value.includes(marker);

/**
 * Does this Sentry event belong to this run's heartbeat for this target?
 *
 * Backend: the existing round-trip rule (`requestId` or `url` tag).
 * Browser: the marker in the `url` tag, title or message, AND the `app` tag
 * naming the target's bundle. Measured 2026-10-01: browser events' `url` tag
 * drops the query string, so in practice the title carries the marker. The
 * `app` check keeps marketing and rialto-web — which share one project —
 * from vouching for each other.
 *
 * @param {unknown} event
 * @param {{ kind: string, app?: string }} target
 * @param {string} marker
 * @returns {boolean}
 */
export function eventMatchesTarget(event, target, marker) {
  if (!event || typeof event !== "object") return false;
  if (target.kind !== "browser") return eventMatchesMarker(event, marker);
  const carriesMarker =
    contains(tagValue(event, "url"), marker) ||
    contains(event.title, marker) ||
    contains(event.message, marker);
  return carriesMarker && tagValue(event, "app") === target.app;
}

/**
 * One target's outcome. "Couldn't ask" (`error`) and "asked, nothing there"
 * (`not-found`) stay distinct, and anything short of a fired trigger is a
 * failure — silence must never read as health.
 *
 * @param {{ triggerResult?: { triggered?: boolean }, found?: unknown, sweepHit?: { project: string }, lookupError?: unknown }} args
 * @returns {{ outcome: "confirmed" | "misrouted" | "not-found" | "provoke-failed" | "error", foundInProject?: string }}
 */
export function classifyTargetOutcome({ triggerResult, found, sweepHit, lookupError }) {
  if (triggerResult?.triggered !== true) return { outcome: "provoke-failed" };
  if (lookupError) return { outcome: "error" };
  if (found) return { outcome: "confirmed" };
  if (sweepHit?.project) return { outcome: "misrouted", foundInProject: sweepHit.project };
  return { outcome: "not-found" };
}

/**
 * Per-project verdicts. A project passes only when EVERY target expecting it
 * is `confirmed`. Every project in the registry appears exactly once, even
 * when its outcomes are missing — a missing outcome is synthesised as
 * `error`, so a crashed trigger can never drop a project from the report.
 *
 * @param {Array<{ targetId: string, outcome: string }>} outcomes
 * @param {ReadonlyArray<{ id: string, project: string }>} registry
 * @returns {Array<{ project: string, pass: boolean, targets: Array<object> }>}
 */
export function projectVerdicts(outcomes, registry) {
  const byTarget = new Map(
    (Array.isArray(outcomes) ? outcomes : []).map((outcome) => [outcome?.targetId, outcome])
  );
  const projects = [...new Set(registry.map((target) => target.project))];
  return projects.map((project) => {
    const targets = registry
      .filter((target) => target.project === project)
      .map(
        (target) =>
          byTarget.get(target.id) ?? {
            targetId: target.id,
            project,
            outcome: "error",
            detail: "no outcome was recorded for this target",
          }
      );
    return { project, pass: targets.every((target) => target.outcome === "confirmed"), targets };
  });
}

/**
 * 0 all pass, 1 any fail, 2 unreadable. Anything this function cannot
 * positively read as a verdict list is 2 — the same fail-closed rule as
 * `roundTripExitCode`.
 *
 * @param {unknown} verdicts
 * @returns {0 | 1 | 2}
 */
export function aggregateExitCode(verdicts) {
  if (!Array.isArray(verdicts) || verdicts.length === 0) return 2;
  const wellFormed = verdicts.every(
    (verdict) => verdict && typeof verdict.project === "string" && typeof verdict.pass === "boolean"
  );
  if (!wellFormed) return 2;
  return verdicts.every((verdict) => verdict.pass) ? 0 : 1;
}

/** @param {{ targetId: string, outcome: string, foundInProject?: string }} target */
export function describeTargetOutcome(target) {
  const base = `${target.targetId}: ${target.outcome}`;
  return target.outcome === "misrouted" && target.foundInProject
    ? `${base} → ${target.foundInProject}`
    : base;
}

/**
 * Markdown for `$GITHUB_STEP_SUMMARY`: one row per project.
 *
 * @param {Array<{ project: string, pass: boolean, targets: Array<object> }>} verdicts
 * @returns {string}
 */
export function renderJobSummary(verdicts) {
  const rows = verdicts.map(
    (verdict) =>
      `| ${verdict.project} | ${verdict.pass ? "PASS" : "FAIL"} | ${verdict.targets
        .map(describeTargetOutcome)
        .join("; ")} |`
  );
  return [
    "## Sentry heartbeat",
    "",
    "| Project | Verdict | Targets |",
    "| --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

/** Every heartbeat marker starts with this (see `buildRoundTripMarker`). */
export const HEARTBEAT_MARKER_PREFIX = "mbe-round-trip";

/**
 * Is this Sentry ISSUE a heartbeat? Triage reads issues, not events, so this
 * is an issue-level rule over `title` and `metadata.value` — both shapes carry
 * the marker: backend `HTTP 429: GET …/health?rt=mbe-round-trip-…`, browser
 * `Error: mbe-round-trip-… sentry heartbeat`.
 *
 * @param {unknown} issue
 * @returns {boolean}
 */
export function isHeartbeatIssue(issue) {
  return (
    contains(issue?.title, HEARTBEAT_MARKER_PREFIX) ||
    contains(issue?.metadata?.value, HEARTBEAT_MARKER_PREFIX)
  );
}

/**
 * The browser bundles' Sentry ingest host. Used ONLY as a request filter to
 * observe the bundle's own envelope POST — nothing in this script sends to it.
 */
export const SENTRY_INGEST_HOST = "o4510650299842560.ingest.us.sentry.io";

const NAVIGATION_TIMEOUT_MS = 30_000;
const ENVELOPE_WAIT_MS = 15_000;

/**
 * Runs INSIDE the deployed page. Puts the marker into the page URL (no
 * navigation, no router event), then throws it uncaught on a fresh task so
 * only the handlers `Sentry.init` installed can capture it.
 *
 * @param {string} marker
 */
function throwHeartbeatInPage(marker) {
  const url = new URL(globalThis.location.href);
  url.searchParams.set("mbe-heartbeat", marker);
  globalThis.history.replaceState(globalThis.history.state, "", url.toString());
  setTimeout(() => {
    throw new Error(`${marker} sentry heartbeat`);
  });
}

/**
 * Make one deployed static bundle capture a marked error.
 *
 * Launches Chromium WITHOUT `bypassCSP`, so the bundle's envelope faces the
 * live CSP exactly as a visitor's would. A missed envelope wait does not fail
 * the target — the request listener can miss it — the Sentry poll decides.
 *
 * @param {{ url: string }} target
 * @param {string} marker
 * @param {{ chromium: { launch: (options?: object) => Promise<any> } }} deps
 * @returns {Promise<{ triggered: boolean, envelopeSeen?: boolean, reason?: string, detail: string }>}
 */
export async function triggerBrowserTarget(target, marker, { chromium }) {
  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    try {
      await page.goto(target.url, { waitUntil: "load", timeout: NAVIGATION_TIMEOUT_MS });
    } catch (error) {
      const reason = `navigation failed: ${error instanceof Error ? error.message : error}`;
      return { triggered: false, reason, detail: [reason, ...consoleErrors].join("\n") };
    }
    const envelope = page
      .waitForRequest(
        (request) => {
          try {
            return new URL(request.url()).hostname === SENTRY_INGEST_HOST;
          } catch {
            return false;
          }
        },
        { timeout: ENVELOPE_WAIT_MS }
      )
      .then(
        () => true,
        () => false
      );
    await page.evaluate(throwHeartbeatInPage, marker);
    const envelopeSeen = await envelope;
    return { triggered: true, envelopeSeen, detail: consoleErrors.join("\n") };
  } finally {
    await browser.close();
  }
}

/** Default wait for a marker to show up in Sentry. */
export const DEFAULT_TIMEOUT_MS = 180_000;

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {unknown} error */
const messageOf = (error) => (error instanceof Error ? error.message : String(error));

/**
 * The origin evidence recorded for a confirmed event (SC-4): its `app` tag
 * for a browser bundle, its `server_name` tag for a service.
 *
 * @param {unknown} event
 * @param {{ kind: string }} target
 */
function originEvidence(event, target) {
  const key = target.kind === "browser" ? "app" : "server_name";
  const value = tagValue(event, key);
  return value === undefined ? undefined : `${key}:${value}`;
}

/**
 * A browser heartbeat must have been sent by a browser SDK. A matched event
 * reporting any other platform means something other than the bundle sent it.
 * An event with no `platform` field is not rejected on that alone — the
 * marker + `app` match already pins it to the bundle.
 *
 * @param {unknown} event
 * @param {{ kind: string }} target
 * @returns {string | undefined} why the origin is wrong, if it is
 */
function originMismatch(event, target) {
  if (target.kind !== "browser" || event?.platform === undefined) return undefined;
  return event.platform === "javascript"
    ? undefined
    : `matched event has platform ${event.platform}, expected javascript (not sent by the bundle)`;
}

/**
 * Poll the expected project until the marker shows up, the window closes, or
 * the lookup fails.
 */
async function pollExpectedProject({ target, marker, lookup, now, sleep, timeoutMs }) {
  const startedAt = now();
  for (
    let attempt = 1;
    shouldKeepPolling({ elapsedMs: now() - startedAt, timeoutMs });
    attempt += 1
  ) {
    await sleep(nextPollDelayMs(attempt));
    try {
      const found = await lookup(target.project, marker, target);
      if (found) return { found };
    } catch (error) {
      return { lookupError: error };
    }
  }
  return {};
}

/** One look in every other in-scope project, to tell "misrouted" from "lost". */
async function sweepOtherProjects({ target, marker, lookup, projects }) {
  const sweepErrors = [];
  for (const project of projects.filter((candidate) => candidate !== target.project)) {
    try {
      const event = await lookup(project, marker, target);
      if (event) return { sweepHit: { project, event }, sweepErrors };
    } catch (error) {
      sweepErrors.push(`sweep of ${project} failed: ${messageOf(error)}`);
    }
  }
  return { sweepErrors };
}

/** Fire one target's trigger and turn everything that follows into an outcome. */
async function runTarget({ target, marker, trigger, lookup, now, sleep, timeoutMs, projects }) {
  const base = { targetId: target.id, project: target.project, marker };
  let triggerResult;
  try {
    triggerResult = await trigger(target, marker);
  } catch (error) {
    triggerResult = { triggered: false, reason: `trigger threw: ${messageOf(error)}` };
  }
  if (triggerResult?.triggered !== true) {
    return {
      ...base,
      ...classifyTargetOutcome({ triggerResult }),
      detail: triggerResult?.reason ?? "trigger did not fire",
    };
  }

  const { found, lookupError } = await pollExpectedProject({
    target,
    marker,
    lookup,
    now,
    sleep,
    timeoutMs,
  });
  const { sweepHit, sweepErrors = [] } =
    found || lookupError ? {} : await sweepOtherProjects({ target, marker, lookup, projects });

  const classified = classifyTargetOutcome({ triggerResult, found, sweepHit, lookupError });
  const event = found ?? sweepHit?.event;
  const mismatch = found ? originMismatch(found, target) : undefined;
  const detail = [
    lookupError ? `lookup failed: ${messageOf(lookupError)}` : undefined,
    mismatch,
    triggerResult.detail || undefined,
    ...sweepErrors,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    ...base,
    ...classified,
    ...(mismatch ? { outcome: "error" } : {}),
    ...(event?.id ? { eventId: event.id } : {}),
    ...(event?.platform ? { platform: event.platform } : {}),
    ...(event && originEvidence(event, target) ? { evidence: originEvidence(event, target) } : {}),
    detail,
  };
}

/**
 * Orchestrate one heartbeat run: a fresh marker per target, every trigger
 * concurrently, a poll of each expected project, and one misroute sweep on a
 * miss. Never throws for a single target's failure — every target comes back
 * with an outcome.
 *
 * @param {{
 *   registry: ReadonlyArray<{ id: string, kind: string, project: string, url: string, app?: string }>,
 *   trigger: (target: object, marker: string) => Promise<{ triggered: boolean, reason?: string, detail?: string }>,
 *   lookup: (project: string, marker: string, target: object) => Promise<unknown>,
 *   now?: () => number,
 *   sleep?: (ms: number) => Promise<void>,
 *   timeoutMs?: number,
 * }} args
 */
export async function runHeartbeat({
  registry,
  trigger,
  lookup,
  now = Date.now,
  sleep = realSleep,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const projects = [...new Set(registry.map((target) => target.project))];
  const runStamp = new Date(now()).toISOString();
  const runNonce = Math.random().toString(36).slice(2, 8);
  return Promise.all(
    registry.map((target) =>
      runTarget({
        target,
        marker: buildRoundTripMarker(runStamp, `${runNonce}-${target.id}`),
        trigger,
        lookup,
        now,
        sleep,
        timeoutMs,
        projects,
      })
    )
  );
}
