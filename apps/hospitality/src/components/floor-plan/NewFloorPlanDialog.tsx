import { useState, useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button, Heading, Input, Text } from "@mattbutlerengineering/rialto";
import { useFocusTrap } from "@mattbutlerengineering/rialto/hooks";
import type { CreateFloorPlanRequest, FloorPlan } from "@mbe/types";
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRID_SIZE } from "./floor-plan-geometry.js";
import styles from "./NewFloorPlanDialog.module.css";

const DEFAULT_LAYOUT = {
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  gridSize: GRID_SIZE,
  showGrid: true,
};

interface NewFloorPlanFormData {
  name: string;
}

export interface NewFloorPlanDialogProps {
  venueId: string;
  onCreated: (floorPlan: FloorPlan) => void;
  onClose: () => void;
  onCreate: (data: CreateFloorPlanRequest) => Promise<FloorPlan>;
}

export function NewFloorPlanDialog({
  venueId,
  onCreated,
  onClose,
  onCreate,
}: NewFloorPlanDialogProps) {
  const { t } = useTranslation();
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
  } = useForm<NewFloorPlanFormData>({
    defaultValues: { name: "" },
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

  const onSubmit = async (data: NewFloorPlanFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const floorPlan = await onCreate({
        venueId,
        name: data.name.trim(),
        layoutJson: DEFAULT_LAYOUT,
      });
      onCreated(floorPlan);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("floorPlan.newDialog.createFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const validationError = errors.name?.message ?? error;

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className={styles.overlay} onClick={handleOverlayClick} onKeyDown={handleOverlayKeyDown}>
      <div
        ref={panelRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-floor-plan-dialog-title"
      >
        <div className={styles.dialogHeader}>
          <Heading id="new-floor-plan-dialog-title" className={styles.dialogTitle}>
            {t("floorPlan.newDialog.title")}
          </Heading>
          <Button
            className={styles.closeButton}
            onClick={handleClose}
            aria-label={t("floorPlan.newDialog.close")}
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

        <form noValidate onSubmit={handleSubmit(onSubmit)} className={styles.form}>
          <div className={styles.fieldGroup}>
            <label htmlFor="floor-plan-name" className={styles.label}>
              {t("floorPlan.newDialog.name")} <Text className={styles.required}>*</Text>
            </label>
            <Input
              id="floor-plan-name"
              type="text"
              className={styles.input}
              placeholder={t("floorPlan.newDialog.placeholder")}
              disabled={isSubmitting}
              {...register("name", {
                validate: (value) =>
                  value.trim().length > 0 || t("floorPlan.newDialog.nameRequired"),
              })}
            />
          </div>

          <div className={styles.dialogFooter}>
            <Button
              type="button"
              className={styles.cancelButton}
              onClick={handleClose}
              disabled={isSubmitting}
            >
              {t("floorPlan.newDialog.cancel")}
            </Button>
            <Button type="submit" className={styles.submitButton} disabled={isSubmitting}>
              {isSubmitting ? t("floorPlan.newDialog.creating") : t("floorPlan.newDialog.create")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
