import { useState } from "react";
import type { CreateFloorPlanRequest, FloorPlan } from "@mbe/types";
import styles from "./NewFloorPlanDialog.module.css";

const DEFAULT_LAYOUT = { width: 800, height: 600, gridSize: 20, showGrid: true };

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
  const [name, setName] = useState("");
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
      setError("Floor plan name is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const floorPlan = await onCreate({
        venueId,
        name: trimmedName,
        layoutJson: DEFAULT_LAYOUT,
      });
      onCreated(floorPlan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create floor plan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className={styles.overlay} onClick={handleOverlayClick} onKeyDown={handleOverlayKeyDown}>
      <div className={styles.dialog} role="dialog" aria-modal="true">
        <div className={styles.dialogHeader}>
          <h2 className={styles.dialogTitle}>New Floor Plan</h2>
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
            <label htmlFor="floor-plan-name" className={styles.label}>
              Name <span className={styles.required}>*</span>
            </label>
            <input
              id="floor-plan-name"
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main Dining Room"
              required
              disabled={isSubmitting}
            />
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
              {isSubmitting ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
