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

import { eventMatchesMarker } from "./sentry-round-trip.mjs";

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
