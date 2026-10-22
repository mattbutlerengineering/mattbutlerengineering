/**
 * The room-template chooser: seven room shapes and four sizes, each card a
 * `TemplateMiniPreview` of what the operator would actually get.
 *
 * Ported from eat-sheet's `TemplatePicker` (#7256), rebuilt on rialto controls
 * and this app's catalogs — the source was a self-contained modal with inline
 * styles and hardcoded English.
 *
 * Fully controlled: the selection lives with the caller, so there is no state
 * to sync in an effect (rialto's setState-in-effect ban). Both groups are
 * `role="radiogroup"` with roving tabindex, matching the venue-onboarding
 * picker's keyboard contract.
 */

import { useCallback, useRef, type JSX, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@mattbutlerengineering/rialto";
import { TemplateMiniPreview } from "./TemplateMiniPreview.js";
import { layoutSummary } from "./room-template-copy.js";
import {
  ROOM_SIZES,
  ROOM_TEMPLATES,
  roomSizeById,
  roomTemplateById,
  type RoomSizeId,
  type RoomTemplateId,
} from "./room-templates.js";
import styles from "./TemplatePicker.module.css";

export interface TemplateSelection {
  readonly templateId: RoomTemplateId;
  readonly sizeId: RoomSizeId;
}

export interface TemplatePickerProps {
  /**
   * The chosen room, or null for "nothing chosen yet" — venue onboarding
   * refuses Next until a room is picked, so it must be able to show an
   * unanswered group rather than a silent default.
   */
  readonly templateId: RoomTemplateId | null;
  readonly sizeId: RoomSizeId;
  readonly onChange: (selection: TemplateSelection) => void;
  readonly disabled?: boolean;
}

/** The index the arrow keys move to, or null for a key this group ignores. */
function nextIndex(key: string, current: number, total: number): number | null {
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % total;
  if (key === "ArrowLeft" || key === "ArrowUp") return (current - 1 + total) % total;
  if (key === "Home") return 0;
  if (key === "End") return total - 1;
  return null;
}

export function TemplatePicker({
  templateId,
  sizeId,
  onChange,
  disabled = false,
}: TemplatePickerProps): JSX.Element {
  const { t } = useTranslation();
  const templateCardsRef = useRef<Map<RoomTemplateId, HTMLButtonElement>>(new Map());
  const sizeCardsRef = useRef<Map<RoomSizeId, HTMLButtonElement>>(new Map());

  const size = roomSizeById(sizeId);
  const selectedLayout =
    templateId === null ? null : roomTemplateById(templateId).build(size.width, size.height);
  // With nothing chosen, the tab stop and the arrow-key origin sit on the
  // first card, so the group stays reachable without being answered.
  const focusedTemplateId = templateId ?? ROOM_TEMPLATES[0]!.id;
  // A size is a property of a room, so there is nothing to size until one is
  // picked. Choosing one here instead would silently answer the room question.
  const sizeDisabled = disabled || templateId === null;

  const selectTemplate = useCallback(
    (next: RoomTemplateId) => {
      if (!disabled) onChange({ templateId: next, sizeId });
    },
    [disabled, onChange, sizeId]
  );

  const selectSize = useCallback(
    (next: RoomSizeId) => {
      if (!sizeDisabled && templateId !== null) onChange({ templateId, sizeId: next });
    },
    [sizeDisabled, onChange, templateId]
  );

  const handleTemplateKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (disabled) return;
      const current = ROOM_TEMPLATES.findIndex((template) => template.id === focusedTemplateId);
      const index = nextIndex(event.key, current, ROOM_TEMPLATES.length);
      if (index === null) return;
      event.preventDefault();
      const next = ROOM_TEMPLATES[index]!;
      templateCardsRef.current.get(next.id)?.focus();
      selectTemplate(next.id);
    },
    [disabled, focusedTemplateId, selectTemplate]
  );

  const handleSizeKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (sizeDisabled) return;
      const current = ROOM_SIZES.findIndex((candidate) => candidate.id === sizeId);
      const index = nextIndex(event.key, current, ROOM_SIZES.length);
      if (index === null) return;
      event.preventDefault();
      const next = ROOM_SIZES[index]!;
      sizeCardsRef.current.get(next.id)?.focus();
      selectSize(next.id);
    },
    [sizeDisabled, sizeId, selectSize]
  );

  return (
    <div className={styles.picker}>
      <div className={styles.fieldset}>
        <Text variant="label">{t("floorPlan.templates.templateLabel")}</Text>
        <div
          role="radiogroup"
          aria-label={t("floorPlan.templates.templateLabel")}
          tabIndex={-1}
          className={styles.templateGrid}
          onKeyDown={handleTemplateKeyDown}
        >
          {ROOM_TEMPLATES.map((template) => {
            const layout = template.build(size.width, size.height);
            const name = t(`floorPlan.templates.items.${template.id}.name`);
            const description = t(`floorPlan.templates.items.${template.id}.description`);
            const isSelected = template.id === templateId;
            const isTabStop = template.id === focusedTemplateId;

            return (
              <Button
                key={template.id}
                ref={(node) => {
                  if (node) templateCardsRef.current.set(template.id, node);
                }}
                variant="ghost"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isTabStop ? 0 : -1}
                disabled={disabled}
                aria-label={t("floorPlan.templates.cardLabel", { name, description })}
                className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}
                onClick={() => selectTemplate(template.id)}
              >
                <TemplateMiniPreview layout={layout} decorative className={styles.cardPreview} />
                <Text variant="label">{name}</Text>
                <Text variant="caption" color="secondary">
                  {description}
                </Text>
                <Text variant="caption" color="tertiary" className={styles.summary}>
                  {layoutSummary(t, layout)}
                </Text>
              </Button>
            );
          })}
        </div>
      </div>

      <div className={styles.fieldset}>
        <Text variant="label">{t("floorPlan.templates.sizeLabel")}</Text>
        <div
          role="radiogroup"
          aria-label={t("floorPlan.templates.sizeLabel")}
          tabIndex={-1}
          className={styles.sizeRow}
          onKeyDown={handleSizeKeyDown}
        >
          {ROOM_SIZES.map((candidate) => {
            const name = t(`floorPlan.templates.sizes.${candidate.id}.name`);
            const description = t(`floorPlan.templates.sizes.${candidate.id}.description`);
            const isSelected = candidate.id === sizeId;

            return (
              <Button
                key={candidate.id}
                ref={(node) => {
                  if (node) sizeCardsRef.current.set(candidate.id, node);
                }}
                variant="ghost"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                disabled={sizeDisabled}
                aria-label={t("floorPlan.templates.cardLabel", { name, description })}
                className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}
                onClick={() => selectSize(candidate.id)}
              >
                <Text variant="label">{name}</Text>
                <Text variant="caption" color="secondary">
                  {description}
                </Text>
              </Button>
            );
          })}
        </div>
      </div>

      {selectedLayout !== null && (
        <div data-testid="template-picker-preview" className={styles.selectedPreview}>
          <TemplateMiniPreview layout={selectedLayout} />
        </div>
      )}
    </div>
  );
}
