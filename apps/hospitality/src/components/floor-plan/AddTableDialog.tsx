import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button, Heading, Input, Text } from "@mattbutlerengineering/rialto";
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
  const [shape, setShape] = useState<TableShape>("rectangle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddTableFormData>({
    defaultValues: { name: "", capacity: 4, minCovers: 1 },
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
      setError(err instanceof Error ? err.message : "Failed to create table.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const validationError =
    errors.name?.message ?? errors.capacity?.message ?? errors.minCovers?.message ?? error;

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className={styles.overlay} onClick={handleOverlayClick} onKeyDown={handleOverlayKeyDown}>
      <div className={styles.dialog} role="dialog" aria-modal="true">
        <div className={styles.dialogHeader}>
          <Heading className={styles.dialogTitle}>Add Table</Heading>
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

        <form noValidate onSubmit={handleSubmit(onFormSubmit)} className={styles.form}>
          <div className={styles.fieldGroup}>
            <label htmlFor="table-name" className={styles.label}>
              Table Name <Text className={styles.required}>*</Text>
            </label>
            <Input
              id="table-name"
              type="text"
              className={styles.input}
              placeholder="e.g. Table 1"
              disabled={isSubmitting}
              {...register("name", {
                validate: (value) => value.trim().length > 0 || "Table name is required.",
              })}
            />
          </div>

          <div className={styles.row}>
            <div className={styles.fieldGroup}>
              <label htmlFor="table-capacity" className={styles.label}>
                Capacity
              </label>
              <Input
                id="table-capacity"
                type="number"
                className={styles.input}
                min={1}
                disabled={isSubmitting}
                {...register("capacity", {
                  valueAsNumber: true,
                  min: { value: 1, message: "Capacity must be at least 1." },
                })}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="table-min-covers" className={styles.label}>
                Min Covers
              </label>
              <Input
                id="table-min-covers"
                type="number"
                className={styles.input}
                min={1}
                disabled={isSubmitting}
                {...register("minCovers", {
                  valueAsNumber: true,
                  min: { value: 1, message: "Min covers must be at least 1." },
                })}
              />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <Text className={styles.label}>Shape</Text>
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
                  <Text className={styles.shapeLabel}>{capitalize(s)}</Text>
                </Button>
              ))}
            </div>
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
              {isSubmitting ? "Adding..." : "Add Table"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
