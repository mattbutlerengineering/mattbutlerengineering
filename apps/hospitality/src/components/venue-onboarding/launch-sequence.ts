/**
 * The Launch sequence: a resumable, four-stage machine that turns a
 * FloorPlanDraft into a live venue.
 *
 * Pressing "Launch Venue" must create four things in order — the venue,
 * its floor plan, N tables, and then activate the plan — and the manager
 * must be able to see where it stopped and retry from there. This module
 * owns that ordering, the resume point, and the duplicate-is-done rule.
 *
 * The resume point is a *value* (`LaunchProgress`), not a state of the
 * world that has to be re-derived. Retry is literally the same function
 * called again with the same progress: `nextStage` can never return
 * "venue" once `progress.venueId` is set, so `POST /api/v1/venues` is
 * never called twice for one Launch.
 *
 * A single transactional backend route was weighed and rejected: it can't
 * produce a per-table "Tables (n of N)" progress readout (no observable
 * boundary between table 1 and table N), and it would create a
 * cross-service deploy-ordering hazard hospitality (Cloudflare Workers)
 * and reservations (DO App Platform) don't otherwise have. So: no route,
 * no `@mbe/types` schema, no `@mbe/api-client` method — only this module.
 *
 * Pure core (stagesFor / nextStage / stageStateOf / tablesDoneCount /
 * isAlreadyCreatedError) + a thin impure loop (runLaunchSequence). The
 * impure half never imports `@mbe/api-client` directly — the caller
 * injects the live client via the structural `LaunchApi` interface, so
 * this module needs no network and no client mock to test.
 *
 * No React, no react-konva.
 */

import type {
  CreateVenueRequest,
  Venue,
  FloorPlan,
  FloorPlanSection,
  Table,
  PaginatedResponse,
  CreateFloorPlanSectionRequest,
  CreateTableRequest,
  CreateFloorPlanRequest,
  UpdateFloorPlanRequest,
  FloorPlanLayout,
} from "@mbe/types";
import { ApiClientError } from "@mbe/api-client";
import { localeRuntime } from "../../i18n/runtime.js";
import type { FloorPlanDraft } from "./floor-plan-draft.js";
import {
  draftLayoutJson,
  draftTableToCreateRequest,
  DUPLICATE_TABLE_NAME_MESSAGE,
} from "./floor-plan-draft.js";
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRID_SIZE } from "../floor-plan/floor-plan-geometry.js";

export type LaunchStageId = "venue" | "floorPlan" | "tables" | "activate";
export type LaunchStageState = "pending" | "in-flight" | "done" | "failed";

export interface LaunchProgress {
  venueId: string | null;
  floorPlanId: string | null;
  /**
   * True once the plan's section rows exist and their zone rectangles are in
   * its layout — or immediately, for a draft that names no zones. The plan and
   * its zones are two writes inside one stage, so `floorPlanId` alone cannot
   * say whether the stage finished: without this, a failure between them would
   * mark floorPlan done and Retry would skip the zones for good.
   */
  sectionsDone: boolean;
  /** Names, not ids — the name is the server's unique key and therefore the resume key. */
  createdTableNames: readonly string[];
  /**
   * True once every table that a template placed in a zone has been assigned
   * to its section. Tables and membership are two writes inside one stage, so
   * `createdTableNames` alone cannot say whether the stage finished. Absent
   * means not yet; it only matters for a draft with tables in zones.
   */
  membershipDone?: boolean;
  activated: boolean;
  inFlightStage: LaunchStageId | null;
  failedStage: LaunchStageId | null;
  errorMessage: string | null;
}

export const INITIAL_LAUNCH_PROGRESS: LaunchProgress = {
  venueId: null,
  floorPlanId: null,
  sectionsDone: false,
  createdTableNames: [],
  activated: false,
  inFlightStage: null,
  failedStage: null,
  errorMessage: null,
};

/**
 * The layoutJson a plan carries when the draft names no room — the canvas
 * default. A draft with a room template chosen is saved at that room's own
 * size and with its walls, via `draftLayoutJson`.
 */
export const DEFAULT_LAYOUT: FloorPlanLayout = {
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  gridSize: GRID_SIZE,
  showGrid: true,
};

const ALL_STAGES: readonly LaunchStageId[] = ["venue", "floorPlan", "tables", "activate"];

/** Omits "tables" when the draft holds none — a row reading "0 of 0" is a stage that never existed. */
export function stagesFor(draft: FloorPlanDraft): readonly LaunchStageId[] {
  if (draft.tables.length === 0) {
    return ALL_STAGES.filter((stage) => stage !== "tables");
  }
  return ALL_STAGES;
}

function isStageDone(
  progress: LaunchProgress,
  stage: LaunchStageId,
  draft: FloorPlanDraft
): boolean {
  switch (stage) {
    case "venue":
      return progress.venueId !== null;
    case "floorPlan":
      return progress.floorPlanId !== null && progress.sectionsDone;
    case "tables":
      return (
        draft.tables.every((table) => progress.createdTableNames.includes(table.name)) &&
        (!needsMembership(draft) || progress.membershipDone === true)
      );
    case "activate":
      return progress.activated;
  }
}

/** True when a template put at least one table inside a named zone. */
function needsMembership(draft: FloorPlanDraft): boolean {
  return (
    draft.sections.length > 0 && draft.tables.some((table) => (table.sectionId ?? null) !== null)
  );
}

/** First incomplete stage, or null when the sequence is complete. Total; no failure modes. */
export function nextStage(progress: LaunchProgress, draft: FloorPlanDraft): LaunchStageId | null {
  for (const stage of stagesFor(draft)) {
    if (!isStageDone(progress, stage, draft)) {
      return stage;
    }
  }
  return null;
}

/**
 * "Done" without a draft in scope. venue/floorPlan/activate read straight
 * off their own progress field. For "tables": by the time this is reached,
 * stageStateOf has already ruled out inFlightStage === "tables" and
 * failedStage === "tables" (checked before this runs) — and the tables
 * stage always either drains every remaining table in one turn or throws,
 * never leaving a partial, non-in-flight, non-failed state. So any created
 * table name at this point means the tables turn ran to completion.
 */
function isDoneWithoutDraft(progress: LaunchProgress, stage: LaunchStageId): boolean {
  switch (stage) {
    case "venue":
      return progress.venueId !== null;
    case "floorPlan":
      return progress.floorPlanId !== null && progress.sectionsDone;
    case "tables":
      return progress.createdTableNames.length > 0;
    case "activate":
      return progress.activated;
  }
}

export function stageStateOf(progress: LaunchProgress, stage: LaunchStageId): LaunchStageState {
  if (progress.inFlightStage === stage) return "in-flight";
  if (progress.failedStage === stage) return "failed";
  return isDoneWithoutDraft(progress, stage) ? "done" : "pending";
}

export function tablesDoneCount(progress: LaunchProgress): number {
  return progress.createdTableNames.length;
}

/** True when a 400 is the server's own duplicate-name rejection — i.e. the table already exists. */
export function isAlreadyCreatedError(err: unknown): boolean {
  return (
    err instanceof ApiClientError &&
    err.problemDetails.status === 400 &&
    err.problemDetails.detail === DUPLICATE_TABLE_NAME_MESSAGE
  );
}

/** Narrow structural interface, so the test needs no network and no client mock module. */
export interface LaunchApi {
  venues: { create(data: CreateVenueRequest): Promise<Venue> };
  floorPlans: {
    create(data: CreateFloorPlanRequest): Promise<FloorPlan>;
    update(id: string, data: UpdateFloorPlanRequest): Promise<FloorPlan>;
    setActive(id: string): Promise<FloorPlan>;
  };
  floorPlanSections: {
    list(venueId: string, floorPlanId?: string): Promise<FloorPlanSection[]>;
    create(venueId: string, data: CreateFloorPlanSectionRequest): Promise<FloorPlanSection>;
    assignTables(venueId: string, sectionId: string, tableIds: string[]): Promise<Table[]>;
  };
  tables: {
    create(data: CreateTableRequest): Promise<Table>;
    list(params: {
      venueId: string;
      page?: number;
      limit?: number;
    }): Promise<PaginatedResponse<Table>>;
  };
}

/** Preserves the original Error (its message is the server's RFC 7807 detail) or falls back. */
function withFallback(err: unknown, fallback: string): Error {
  return err instanceof Error && err.message ? err : new Error(fallback);
}

async function runVenueStage(
  api: LaunchApi,
  venuePayload: CreateVenueRequest,
  progress: LaunchProgress,
  onProgress: (next: LaunchProgress) => void
): Promise<LaunchProgress> {
  let venue: Venue;
  try {
    venue = await api.venues.create(venuePayload);
  } catch (err) {
    throw withFallback(err, localeRuntime.i18n.t("onboarding.stagePanel.venueFailed"));
  }
  const next: LaunchProgress = { ...progress, venueId: venue.id, inFlightStage: null };
  onProgress(next);
  return next;
}

/**
 * Creates the room's section rows and writes their zone rectangles into the
 * plan's layout. Folded into the floorPlan stage rather than given a stage of
 * its own so `LaunchProgress` keeps its four-stage shape; it is made resumable
 * the same way tables are — **by name**. A retry lists what already exists and
 * creates only the rest, so `progress.floorPlanId` being set (which makes the
 * stage "done" and is recorded as soon as the plan exists) can never leave a
 * half-built set of zones behind.
 *
 * A plan with no sections (Blank, or a draft from before rooms existed) makes
 * no calls at all.
 */
async function createSectionsFor(
  api: LaunchApi,
  venueId: string,
  floorPlanId: string,
  draft: FloorPlanDraft
): Promise<void> {
  if (draft.sections.length === 0) return;

  const existing = await api.floorPlanSections.list(venueId, floorPlanId);
  const byName = new Map(existing.map((row) => [row.name, row]));

  for (const [index, zone] of draft.sections.entries()) {
    if (byName.has(zone.name)) continue;
    const row = await api.floorPlanSections.create(venueId, {
      floorPlanId,
      name: zone.name,
      color: zone.color,
      displayOrder: index,
    });
    byName.set(zone.name, row);
  }

  // A zone's rectangle is keyed by its row id, so the layout can only be
  // written once the rows exist.
  const sections = draft.sections.flatMap((zone) => {
    const row = byName.get(zone.name);
    return row
      ? [{ id: row.id, x: zone.x, y: zone.y, width: zone.width, height: zone.height }]
      : [];
  });

  await api.floorPlans.update(floorPlanId, {
    layoutJson: { ...draftLayoutJson(draft), sections },
  });
}

async function runFloorPlanStage(
  api: LaunchApi,
  draft: FloorPlanDraft,
  progress: LaunchProgress,
  onProgress: (next: LaunchProgress) => void
): Promise<LaunchProgress> {
  const venueId = progress.venueId;
  // Invariant: nextStage only selects "floorPlan" once "venue" is done
  // (stagesFor's order is fixed), so venueId is always set here.
  if (venueId === null) {
    throw new Error("runLaunchSequence: floorPlan stage reached without a venueId");
  }

  // A retry after the zones failed re-enters this stage with the plan already
  // created; creating it again would leave the venue with two plans.
  let floorPlanId = progress.floorPlanId;
  if (floorPlanId === null) {
    try {
      const floorPlan = await api.floorPlans.create({
        venueId,
        name: draft.planName,
        layoutJson: draft.templateId === null ? DEFAULT_LAYOUT : draftLayoutJson(draft),
      });
      floorPlanId = floorPlan.id;
    } catch (err) {
      throw withFallback(err, localeRuntime.i18n.t("onboarding.stagePanel.planFailed"));
    }
  }

  const withPlan: LaunchProgress = { ...progress, floorPlanId, inFlightStage: null };
  try {
    await createSectionsFor(api, venueId, floorPlanId, draft);
  } catch (err) {
    // Carry the plan's id out with the failure so Retry resumes at the zones
    // (which are idempotent by name) instead of creating a second plan.
    throw new LaunchStageError(
      withFallback(err, localeRuntime.i18n.t("onboarding.stagePanel.planFailed")).message,
      withPlan
    );
  }

  const next: LaunchProgress = { ...withPlan, sectionsDone: true };
  onProgress(next);
  return next;
}

/**
 * Carries the progress accumulated partway through a stage that then
 * failed (only ever non-trivial for "tables", the one stage that makes
 * more than one API call) so the outer loop's catch doesn't discard
 * tables already created before the failing one.
 */
class LaunchStageError extends Error {
  readonly partialProgress: LaunchProgress;

  constructor(message: string, partialProgress: LaunchProgress) {
    super(message);
    this.partialProgress = partialProgress;
  }
}

/** The server's cap on `limit` (`parsePaginationQuery` in `@mbe/database`). */
const MAX_PAGE_SIZE = 100;

/**
 * Puts each template table into the section the template placed it in.
 *
 * Progress keeps table *names*, not ids, so the ids are recovered by listing
 * the venue's tables — the venue was created by this Launch, so every table it
 * holds is one of ours. `PUT /floor-plan-sections/:id/tables` sets exact
 * membership, which makes a retry that re-runs this a no-op rather than a
 * duplicate.
 */
async function assignTablesToSections(
  api: LaunchApi,
  venueId: string,
  floorPlanId: string,
  draft: FloorPlanDraft
): Promise<void> {
  const idByTableName = new Map<string, string>();
  for (let page = 1; ; page += 1) {
    const { data, pagination } = await api.tables.list({ venueId, page, limit: MAX_PAGE_SIZE });
    for (const table of data) idByTableName.set(table.name, table.id);
    if (data.length === 0 || page >= pagination.totalPages) break;
  }

  const rows = await api.floorPlanSections.list(venueId, floorPlanId);
  const rowByName = new Map(rows.map((row) => [row.name, row]));

  for (const zone of draft.sections) {
    const row = rowByName.get(zone.name);
    if (!row) continue;
    const tableIds = draft.tables.flatMap((table) => {
      const id = idByTableName.get(table.name);
      return table.sectionId === zone.id && id !== undefined ? [id] : [];
    });
    if (tableIds.length === 0) continue;
    await api.floorPlanSections.assignTables(venueId, row.id, tableIds);
  }
}

async function runTablesStage(
  api: LaunchApi,
  draft: FloorPlanDraft,
  progress: LaunchProgress,
  onProgress: (next: LaunchProgress) => void
): Promise<LaunchProgress> {
  const venueId = progress.venueId;
  const floorPlanId = progress.floorPlanId;
  // Invariant: nextStage only selects "tables" once "venue" and
  // "floorPlan" are done (stagesFor's order is fixed).
  if (venueId === null || floorPlanId === null) {
    throw new Error("runLaunchSequence: tables stage reached without venueId/floorPlanId");
  }

  let current = progress;
  const total = draft.tables.length;

  for (const [index, table] of draft.tables.entries()) {
    if (current.createdTableNames.includes(table.name)) {
      // Already created in a prior attempt — resume starts at the next one.
      continue;
    }

    try {
      await api.tables.create(draftTableToCreateRequest(table, venueId, floorPlanId));
    } catch (err) {
      if (!isAlreadyCreatedError(err)) {
        const fallback = localeRuntime.i18n.t("onboarding.errors.stoppedAtTable", {
          index: index + 1,
          total,
        });
        throw new LaunchStageError(withFallback(err, fallback).message, current);
      }
      // A duplicate-name rejection means the table already exists —
      // counts as done, loop continues to the next table.
    }

    current = { ...current, createdTableNames: [...current.createdTableNames, table.name] };
    onProgress(current);
  }

  if (needsMembership(draft)) {
    try {
      await assignTablesToSections(api, venueId, floorPlanId, draft);
    } catch (err) {
      const fallback = localeRuntime.i18n.t("onboarding.errors.generic");
      throw new LaunchStageError(withFallback(err, fallback).message, current);
    }
    current = { ...current, membershipDone: true };
  }

  current = { ...current, inFlightStage: null };
  onProgress(current);
  return current;
}

async function runActivateStage(
  api: LaunchApi,
  progress: LaunchProgress,
  onProgress: (next: LaunchProgress) => void
): Promise<LaunchProgress> {
  const floorPlanId = progress.floorPlanId;
  // Invariant: nextStage only selects "activate" once "floorPlan" is done
  // (stagesFor's order is fixed).
  if (floorPlanId === null) {
    throw new Error("runLaunchSequence: activate stage reached without a floorPlanId");
  }

  try {
    await api.floorPlans.setActive(floorPlanId);
  } catch (err) {
    throw withFallback(err, localeRuntime.i18n.t("onboarding.stagePanel.activateFailed"));
  }
  const next: LaunchProgress = { ...progress, activated: true, inFlightStage: null };
  onProgress(next);
  return next;
}

async function runStage(
  api: LaunchApi,
  stage: LaunchStageId,
  draft: FloorPlanDraft,
  venuePayload: CreateVenueRequest,
  progress: LaunchProgress,
  onProgress: (next: LaunchProgress) => void
): Promise<LaunchProgress> {
  switch (stage) {
    case "venue":
      return runVenueStage(api, venuePayload, progress, onProgress);
    case "floorPlan":
      return runFloorPlanStage(api, draft, progress, onProgress);
    case "tables":
      return runTablesStage(api, draft, progress, onProgress);
    case "activate":
      return runActivateStage(api, progress, onProgress);
  }
}

/**
 * Executes ONE stage per turn until nextStage returns null or a stage fails.
 * Never throws: a failure sets failedStage + errorMessage and returns.
 * Calls onProgress after every progress change so the panel updates live.
 */
export async function runLaunchSequence(
  api: LaunchApi,
  draft: FloorPlanDraft,
  venuePayload: CreateVenueRequest,
  progress: LaunchProgress,
  onProgress: (next: LaunchProgress) => void
): Promise<LaunchProgress> {
  let current = progress;

  while (true) {
    const stage = nextStage(current, draft);
    if (stage === null) {
      return current;
    }

    current = { ...current, inFlightStage: stage, failedStage: null, errorMessage: null };
    // Emit before awaiting the stage — otherwise venue/floorPlan/activate
    // (which call onProgress only once, on completion) never surface an
    // in-flight value, and stageStateOf can never read "in-flight" for them.
    onProgress(current);

    try {
      current = await runStage(api, stage, draft, venuePayload, current, onProgress);
    } catch (err) {
      // A LaunchStageError carries whatever progress accumulated before
      // the failure (e.g. tables created before the one that rejected) —
      // use it instead of the pre-stage `current` so that work isn't lost.
      const base = err instanceof LaunchStageError ? err.partialProgress : current;
      current = {
        ...base,
        inFlightStage: null,
        failedStage: stage,
        errorMessage:
          err instanceof Error ? err.message : localeRuntime.i18n.t("onboarding.errors.generic"),
      };
      onProgress(current);
      return current;
    }
  }
}
