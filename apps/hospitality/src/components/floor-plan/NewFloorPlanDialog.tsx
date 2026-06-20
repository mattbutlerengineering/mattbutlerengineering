import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button, Heading, Input, Text } from "@mattbutlerengineering/rialto";
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewFloorPlanFormData>({
    defaultValues: { name: "" },
  });

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleOverlayKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      onClose();
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
      setError(err instanceof Error ? err.message : "Failed to create floor plan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const validationError = errors.name?.message ?? error;

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className={styles.overlay} onClick={handleOverlayClick} onKeyDown={handleOverlayKeyDown}>
      <div className={styles.dialog} role="dialog" aria-modal="true">
        <div className={styles.dialogHeader}>
          <Heading className={styles.dialogTitle}>New Floor Plan</Heading>
          <Button className={styles.closeButton} onClick={onClose} aria-label="Close dialog">
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

        {validationError && <div className={styles.errorBanner}>{validationError}</div>}

        <form noValidate onSubmit={handleSubmit(onSubmit)} className={styles.form}>
          <div className={styles.fieldGroup}>
            <label htmlFor="floor-plan-name" className={styles.label}>
              Name <Text className={styles.required}>*</Text>
            </label>
            <Input
              id="floor-plan-name"
              type="text"
              className={styles.input}
              placeholder="e.g. Main Dining Room"
              disabled={isSubmitting}
              {...register("name", {
                validate: (value) => value.trim().length > 0 || "Floor plan name is required.",
              })}
            />
          </div>

          <div className={styles.dialogFooter}>
            <Button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" className={styles.submitButton} disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
