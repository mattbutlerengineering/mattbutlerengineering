import { ROOM_SIZE_IDS, ROOM_TEMPLATE_IDS, type RoomSizeId, type RoomTemplateId } from "@mbe/types";
import { localeRuntime } from "../../i18n/runtime.js";
import type { FloorPlanDraft } from "./floor-plan-draft.js";
import { draftFromTemplate, resizeDraft } from "./floor-plan-templates.js";

/**
 * The floor-plan patch (#9475): a room template and/or a room size, the two things the step's
 * picker offers. Applying one is what the picker does (`draftFromTemplate` / `resizeDraft`), so
 * the draft is the same either way. Tables the owner has moved, added or removed are theirs: the
 * picker asks before replacing them, and a chat turn cannot answer that question.
 */

export const FLOOR_PLAN_FIELDS = ["templateId", "roomSize"] as const;

/** The draft as the flat strings the patch and the server's `draft` use. */
export function floorPlanDraftOf(draft: FloorPlanDraft): Record<string, string> {
  return { templateId: draft.templateId ?? "", roomSize: draft.sizeId };
}

function isTemplateId(value: string): value is RoomTemplateId {
  return (ROOM_TEMPLATE_IDS as readonly string[]).includes(value);
}

function isSizeId(value: string): value is RoomSizeId {
  return (ROOM_SIZE_IDS as readonly string[]).includes(value);
}

type Errors = Partial<Record<string, string>>;

export type FloorPlanPatchResult =
  { ok: true; draft: FloorPlanDraft } | { ok: false; errors: Errors };

export function applyFloorPlanPatch(
  current: FloorPlanDraft,
  fields: Record<string, string>
): FloorPlanPatchResult {
  const t = localeRuntime.i18n.t;
  const errors: Errors = {};
  const { templateId, roomSize } = fields;
  if (templateId !== undefined && !isTemplateId(templateId)) {
    errors.templateId = t("onboarding.chat.notOffered.templateId", { value: templateId });
  }
  if (roomSize !== undefined && !isSizeId(roomSize)) {
    errors.roomSize = t("onboarding.chat.notOffered.roomSize", { value: roomSize });
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const nextTemplate =
    templateId === undefined ? current.templateId : (templateId as RoomTemplateId);
  const nextSize = roomSize === undefined ? current.sizeId : (roomSize as RoomSizeId);
  const unchanged = nextTemplate === current.templateId && nextSize === current.sizeId;
  if (unchanged) return { ok: true, draft: current };
  if (!current.pristine) {
    return { ok: false, errors: { templateId: t("onboarding.chat.floorPlanEdited") } };
  }
  const draft =
    nextTemplate === null
      ? resizeDraft(current, nextSize)
      : draftFromTemplate(nextTemplate, nextSize);
  return { ok: true, draft };
}
