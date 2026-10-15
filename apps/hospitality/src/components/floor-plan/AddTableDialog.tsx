import { useState, useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button, Heading, Input, Text } from "@mattbutlerengineering/rialto";
import { useFocusTrap } from "@mattbutlerengineering/rialto/hooks";
import type { CreateTableRequest } from "@mbe/types";
import { SHAPE_DEFAULTS, CANVAS_CENTER } from "./floor-plan-geometry.js";
import styles from "./AddTableDialog.module.css";

type TableShape = "rectangle" | "square" | "circle";

interface AddTableFormData {
  name: string;
  capacity: number;
  minCovers: number;
}

export interface AddTableDialogProps {
  venueId: string;
  floorPlanId: string;
  onSubmit: (data: CreateTableRequest) => Promise<void>;
  onClose: () => void;
}

export function AddTableDialog({ venueId, floorPlanId, onSubmit, onClose }: AddTableDialogProps) {
  const { t } = useTranslation();
  const [shape, setShape] = useState<TableShape>("rectangle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
  }, []);

  const handleClose = useCallback(() => {
    previouslyFocusedRef.current?.focus();
    onClose();
  }, [onClose]);

  useFocusTrap(panelRef, true);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddTableFormData>({
    defaultValues: { name: "", capacity: 4, minCovers: 1 },
  });

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleOverlayKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      handleClose();
    }
  };

  const onFormSubmit = async (data: AddTableFormData) => {
    const dims = SHAPE_DEFAULTS[shape];
    const request: CreateTableRequest = {
      name: data.name.trim(),
      capacity: Number(data.capacity),
      minCovers: Number(data.minCovers),
      venueId,
      floorPlanId,
      shapeMetadata: {
        shape,
        x: CANVAS_CENTER.x,
        y: CANVAS_CENTER.y,
        width: dims.width,
        height: dims.height,
      },
    };

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit(request);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("floorPlan.addTableDialog.createFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const validationError =
    errors.name?.message ?? errors.capacity?.message ?? errors.minCovers?.message ?? error;

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className={styles.overlay} onClick={handleOverlayClick} onKeyDown={handleOverlayKeyDown}>
      <div
        ref={panelRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-table-dialog-title"
      >
        <div className={styles.dialogHeader}>
          <Heading id="add-table-dialog-title" className={styles.dialogTitle}>
            {t("floorPlan.addTableDialog.title")}
          </Heading>
          <Button
            className={styles.closeButton}
            onClick={handleClose}
            aria-label={t("floorPlan.addTableDialog.close")}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </Button>
        </div>

        {validationError && (
          <div role="alert" aria-live="assertive" className={styles.errorBanner}>
            {validationError}
          </div>
        )}

        <form noValidate onSubmit={handleSubmit(onFormSubmit)} className={styles.form}>
          <div className={styles.fieldGroup}>
            <label htmlFor="table-name" className={styles.label}>
              {t("floorPlan.addTableDialog.name")} <Text className={styles.required}>*</Text>
            </label>
            <Input
              id="table-name"
              type="text"
              className={styles.input}
              placeholder={t("floorPlan.addTableDialog.placeholder")}
              disabled={isSubmitting}
              {...register("name", {
                validate: (value) =>
                  value.trim().length > 0 || t("floorPlan.addTableDialog.nameRequired"),
              })}
            />
          </div>

          <div className={styles.row}>
            <div className={styles.fieldGroup}>
              <label htmlFor="table-capacity" className={styles.label}>
                {t("floorPlan.addTableDialog.capacity")}
              </label>
              <Input
                id="table-capacity"
                type="number"
                className={styles.input}
                min={1}
                disabled={isSubmitting}
                {...register("capacity", {
                  valueAsNumber: true,
                  min: { value: 1, message: t("floorPlan.addTableDialog.capacityMin") },
                })}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="table-min-covers" className={styles.label}>
                {t("floorPlan.addTableDialog.minCovers")}
              </label>
              <Input
                id="table-min-covers"
                type="number"
                className={styles.input}
                min={1}
                disabled={isSubmitting}
                {...register("minCovers", {
                  valueAsNumber: true,
                  min: { value: 1, message: t("floorPlan.addTableDialog.minCoversMin") },
                })}
              />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <Text className={styles.label}>{t("floorPlan.addTableDialog.shape")}</Text>
            <div className={styles.shapeSelector}>
              {(["rectangle", "square", "circle"] as TableShape[]).map((s) => (
                <Button
                  key={s}
                  type="button"
                  className={`${styles.shapeButton} ${shape === s ? styles.shapeButtonActive : ""}`}
                  onClick={() => setShape(s)}
                  disabled={isSubmitting}
                  aria-pressed={shape === s}
                >
                  <Text className={styles.shapeIcon} aria-hidden="true">
                    {s === "rectangle" && <RectangleIcon />}
                    {s === "square" && <SquareIcon />}
                    {s === "circle" && <CircleIcon />}
                  </Text>
                  <Text className={styles.shapeLabel}>
                    {t(`floorPlan.addTableDialog.shapes.${s}`)}
                  </Text>
                </Button>
              ))}
            </div>
          </div>

          <div className={styles.dialogFooter}>
            <Button
              type="button"
              className={styles.cancelButton}
              onClick={handleClose}
              disabled={isSubmitting}
            >
              {t("floorPlan.addTableDialog.cancel")}
            </Button>
            <Button type="submit" className={styles.submitButton} disabled={isSubmitting}>
              {isSubmitting
                ? t("floorPlan.addTableDialog.adding")
                : t("floorPlan.addTableDialog.submit")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RectangleIcon() {
  return (
    <svg width="28" height="20" viewBox="0 0 28 20" fill="none" stroke="currentColor">
      <rect x="2" y="4" width="24" height="12" rx="2" strokeWidth="2" />
    </svg>
  );
}

function SquareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor">
      <rect x="2" y="2" width="16" height="16" rx="2" strokeWidth="2" />
    </svg>
  );
}

function CircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor">
      <circle cx="10" cy="10" r="8" strokeWidth="2" />
    </svg>
  );
}
