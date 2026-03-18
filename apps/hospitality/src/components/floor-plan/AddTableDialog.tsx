import { useState } from "react";
import type { CreateTableRequest } from "@mbe/types";
import styles from "./AddTableDialog.module.css";

type TableShape = "rectangle" | "square" | "circle";

interface ShapeDimensions {
  width: number;
  height: number;
}

const SHAPE_DEFAULTS: Record<TableShape, ShapeDimensions> = {
  rectangle: { width: 100, height: 60 },
  square: { width: 70, height: 70 },
  circle: { width: 70, height: 70 },
};

const CANVAS_CENTER = { x: 400, y: 300 };

export interface AddTableDialogProps {
  venueId: string;
  floorPlanId: string;
  onSubmit: (data: CreateTableRequest) => Promise<void>;
  onClose: () => void;
}

export function AddTableDialog({ venueId, floorPlanId, onSubmit, onClose }: AddTableDialogProps) {
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(4);
  const [minCovers, setMinCovers] = useState(1);
  const [shape, setShape] = useState<TableShape>("rectangle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Table name is required.");
      return;
    }
    if (capacity < 1) {
      setError("Capacity must be at least 1.");
      return;
    }
    if (minCovers < 1) {
      setError("Min covers must be at least 1.");
      return;
    }

    const dims = SHAPE_DEFAULTS[shape];
    const data: CreateTableRequest = {
      name: trimmedName,
      capacity,
      minCovers,
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
      await onSubmit(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create table.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className={styles.overlay} onClick={handleOverlayClick} onKeyDown={handleOverlayKeyDown}>
      <div className={styles.dialog} role="dialog" aria-modal="true">
        <div className={styles.dialogHeader}>
          <h2 className={styles.dialogTitle}>Add Table</h2>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close dialog">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.fieldGroup}>
            <label htmlFor="table-name" className={styles.label}>
              Table Name <span className={styles.required}>*</span>
            </label>
            <input
              id="table-name"
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Table 1"
              required
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.row}>
            <div className={styles.fieldGroup}>
              <label htmlFor="table-capacity" className={styles.label}>
                Capacity
              </label>
              <input
                id="table-capacity"
                type="number"
                className={styles.input}
                value={capacity}
                min={1}
                onChange={(e) => setCapacity(Math.max(1, Number(e.target.value)))}
                disabled={isSubmitting}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="table-min-covers" className={styles.label}>
                Min Covers
              </label>
              <input
                id="table-min-covers"
                type="number"
                className={styles.input}
                value={minCovers}
                min={1}
                onChange={(e) => setMinCovers(Math.max(1, Number(e.target.value)))}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <span className={styles.label}>Shape</span>
            <div className={styles.shapeSelector}>
              {(["rectangle", "square", "circle"] as TableShape[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`${styles.shapeButton} ${shape === s ? styles.shapeButtonActive : ""}`}
                  onClick={() => setShape(s)}
                  disabled={isSubmitting}
                  aria-pressed={shape === s}
                >
                  <span className={styles.shapeIcon} aria-hidden="true">
                    {s === "rectangle" && <RectangleIcon />}
                    {s === "square" && <SquareIcon />}
                    {s === "circle" && <CircleIcon />}
                  </span>
                  <span className={styles.shapeLabel}>{capitalize(s)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.dialogFooter}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
              {isSubmitting ? "Adding..." : "Add Table"}
            </button>
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
