import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, Input, Text } from "@mattbutlerengineering/rialto";
import type { Table, UpdateTableRequest } from "@mbe/types";
import {
  buildTableUpdate,
  parsePositiveInt,
  tableToFormValues,
  type TableDetailsFormValues,
} from "./table-update.js";
import styles from "./TableDetailsForm.module.css";

/** The text fields react-hook-form owns; `isActive` is a Rialto Checkbox. */
type TextFieldValues = Omit<TableDetailsFormValues, "isActive">;

export interface TableDetailsFormProps {
  table: Table;
  /** Applies the delta. Rejecting surfaces the message without discarding the edit. */
  onSave: (tableId: string, changes: UpdateTableRequest) => Promise<void>;
  onDelete: (tableId: string) => void;
  /** Reports whether an unsaved edit is pending, so the page can guard navigation. */
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Editable details for the table selected on the floor plan.
 *
 * Mount this with `key={table.id}` — the form seeds its fields from the table
 * once, and remounting on selection is what re-seeds them. That keeps the
 * component free of the useEffect+setState prop-sync that would otherwise be
 * needed, and means a half-typed edit can never leak onto another table.
 *
 * Shape, size and position are deliberately not editable here: they are set at
 * creation and changed by dragging on the canvas, which autosaves separately.
 */
export function TableDetailsForm({
  table,
  onSave,
  onDelete,
  onDirtyChange,
}: TableDetailsFormProps) {
  const { t } = useTranslation();
  const seeded = tableToFormValues(table);

  // The baseline the delta is measured against. It moves forward on a
  // successful save so the form goes quiet again without a refetch.
  const [initial, setInitial] = useState<TableDetailsFormValues>(seeded);
  const [isActive, setIsActive] = useState(seeded.isActive);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<TextFieldValues>({ defaultValues: seeded });

  // Dirtiness comes from the form, never from `buildTableUpdate`: the builder
  // discards values it cannot parse, so a half-typed number would read as no
  // change at all and disable Save while the operator looks at their own edit
  // — with no way to reach the validation message explaining it.
  const hasChanges = isDirty || isActive !== initial.isActive;

  useEffect(() => {
    onDirtyChange?.(hasChanges);
    // Unmount (delete, deselection, navigation) must clear the flag, or the
    // page's nav guard stays armed for a form that no longer exists.
    return () => onDirtyChange?.(false);
  }, [hasChanges, onDirtyChange]);

  const onFormSubmit = async (values: TextFieldValues) => {
    const current: TableDetailsFormValues = { ...values, isActive };
    const changes = buildTableUpdate(initial, current);

    // Whitespace-only edits are dirty to the form but mean nothing to the API.
    // Re-baseline and go quiet rather than sending an empty PATCH.
    if (Object.keys(changes).length === 0) {
      setInitial(current);
      reset(current);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onSave(table.id, changes);
      setInitial(current);
      reset(current);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t("floorPlan.editor.saveTableFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form noValidate onSubmit={handleSubmit(onFormSubmit)} className={styles.form}>
      {submitError && <div className={styles.errorBanner}>{submitError}</div>}

      <Input
        label={t("floorPlan.editor.name")}
        type="text"
        disabled={isSubmitting}
        error={!!errors.name}
        hint={errors.name?.message}
        {...register("name", {
          validate: (value) => value.trim().length > 0 || t("floorPlan.editor.nameRequired"),
        })}
      />

      <Input
        label={t("floorPlan.editor.tableNumber")}
        type="text"
        placeholder={t("floorPlan.editor.tableNumberPlaceholder")}
        disabled={isSubmitting}
        {...register("tableNumber")}
      />

      <div className={styles.row}>
        <Input
          label={t("floorPlan.editor.capacity")}
          type="number"
          min={1}
          disabled={isSubmitting}
          error={!!errors.capacity}
          hint={errors.capacity?.message}
          {...register("capacity", {
            validate: (value) =>
              parsePositiveInt(value) !== null || t("floorPlan.editor.capacityMin"),
          })}
        />
        <Input
          label={t("floorPlan.editor.minCovers")}
          type="number"
          min={1}
          disabled={isSubmitting}
          error={!!errors.minCovers}
          hint={errors.minCovers?.message}
          {...register("minCovers", {
            validate: (value, values) => {
              const min = parsePositiveInt(value);
              if (min === null) return t("floorPlan.editor.minCoversMin");
              const max = parsePositiveInt(values.maxCovers);
              if (max !== null && min > max) return t("floorPlan.editor.minCoversExceedsMax");
              return true;
            },
          })}
        />
        <Input
          label={t("floorPlan.editor.maxCovers")}
          type="number"
          min={1}
          disabled={isSubmitting}
          error={!!errors.maxCovers}
          hint={errors.maxCovers?.message}
          {...register("maxCovers", {
            validate: (value) =>
              parsePositiveInt(value) !== null || t("floorPlan.editor.maxCoversMin"),
          })}
        />
      </div>

      <Input
        label={t("floorPlan.editor.location")}
        type="text"
        placeholder={t("floorPlan.editor.locationPlaceholder")}
        disabled={isSubmitting}
        {...register("location")}
      />

      <Checkbox
        label={t("floorPlan.editor.active")}
        description={t("floorPlan.editor.activeDescription")}
        checked={isActive}
        onCheckedChange={setIsActive}
        disabled={isSubmitting}
      />

      <div className={styles.readOnlyField}>
        <Text className={styles.detailLabel}>{t("floorPlan.editor.position")}</Text>
        <div className={styles.detailValueMono}>
          {t("floorPlan.editor.positionValue", {
            x: table.shapeMetadata?.x ?? 0,
            y: table.shapeMetadata?.y ?? 0,
          })}
        </div>
      </div>

      <div className={styles.actions}>
        <Button type="submit" className={styles.saveButton} disabled={!hasChanges || isSubmitting}>
          {isSubmitting ? t("floorPlan.editor.saving") : t("floorPlan.editor.saveTable")}
        </Button>
        <Button
          type="button"
          className={styles.deleteButton}
          onClick={() => onDelete(table.id)}
          disabled={isSubmitting}
        >
          {t("floorPlan.editor.deleteTable")}
        </Button>
      </div>
    </form>
  );
}
