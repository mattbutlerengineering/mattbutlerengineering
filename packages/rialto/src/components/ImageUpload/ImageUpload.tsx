import { forwardRef, useCallback, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Plus } from "lucide-react";
import { spring } from "../../tokens/motion";
import { cn } from "../../utils/class-composer";
import styles from "./ImageUpload.module.css";

/**
 * A placeholder tile that accepts an image via click or drag-and-drop.
 * The tile visually *becomes* the image — the empty state matches the shape
 * of the final preview, making the upload feel like completion rather than form-filling.
 *
 * Fully controlled: the parent owns `value`, `progress`, `done`, and `error` state.
 *
 * @example
 * <ImageUpload
 *   value={previewUrl}
 *   onChange={(file) => setFile(file)}
 *   label="Logo"
 *   hint="PNG, SVG, or JPG · max 2MB"
 *   accept="image/png,image/jpeg,image/svg+xml"
 *   maxSize={2 * 1024 * 1024}
 * />
 */
export interface ImageUploadProps {
  /** Current image URL (object URL for preview, or remote URL for existing image) */
  value?: string;
  /** Called with the selected File, or null when cleared via Replace */
  onChange?: (file: File | null) => void;
  /** Called when client-side validation fails (size or type) */
  onValidationError?: (message: string) => void;
  /** Upload progress 0–100; renders the progress bar overlay */
  progress?: number;
  /** When true, shows a success checkmark */
  done?: boolean;
  /** Error message displayed below the tile */
  error?: string;
  /** Accepted MIME types (forwarded to the hidden file input) */
  accept?: string;
  /** Maximum file size in bytes; files exceeding this trigger onValidationError */
  maxSize?: number;
  /** Tile size */
  size?: "sm" | "md" | "lg";
  /** Label rendered below the tile */
  label?: string;
  /** Hint text rendered below the label */
  hint?: string;
  disabled?: boolean;
  className?: string;
}

function matchesAccept(file: File, accept: string): boolean {
  const types = accept.split(",").map((t) => t.trim());
  return types.some((type) => {
    if (type.endsWith("/*")) {
      return file.type.startsWith(type.replace("/*", "/"));
    }
    return file.type === type;
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export const ImageUpload = forwardRef<HTMLDivElement, ImageUploadProps>(
  (
    {
      value,
      onChange,
      onValidationError,
      progress,
      done,
      error,
      accept,
      maxSize,
      size = "md",
      label,
      hint,
      disabled,
      className,
    },
    ref
  ) => {
    const autoId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const shouldReduceMotion = useReducedMotion();

    const hasPreview = Boolean(value);
    const isUploading = progress !== undefined && progress < 100;

    const validate = useCallback(
      (file: File): boolean => {
        if (maxSize && file.size > maxSize) {
          onValidationError?.(
            `File exceeds maximum size of ${formatBytes(maxSize)} — this file is ${formatBytes(file.size)}`
          );
          return false;
        }
        if (accept && !matchesAccept(file, accept)) {
          onValidationError?.(`File type not accepted. Accepted: ${accept}`);
          return false;
        }
        return true;
      },
      [accept, maxSize, onValidationError]
    );

    const handleFile = useCallback(
      (file: File) => {
        if (validate(file)) {
          onChange?.(file);
        }
      },
      [onChange, validate]
    );

    const openPicker = useCallback(() => {
      if (disabled) return;
      inputRef.current?.click();
    }, [disabled]);

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        // Reset so re-selecting the same file triggers onChange
        e.target.value = "";
      },
      [handleFile]
    );

    const handleDragOver = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      },
      [disabled]
    );

    const handleDragLeave = useCallback(() => {
      setDragOver(false);
    }, []);

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled) return;
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      },
      [disabled, handleFile]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPicker();
        }
      },
      [openPicker]
    );

    const handleReplace = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange?.(null);
        openPicker();
      },
      [onChange, openPicker]
    );

    const tileClass = cn(
      styles.tile,
      styles[size],
      dragOver && styles.dragOver,
      hasPreview && styles.hasPreview,
      error && styles.error,
      done && styles.done,
      disabled && styles.disabled
    );

    const wrapperClass = cn(styles.wrapper, className);

    return (
      <div ref={ref} className={wrapperClass}>
        <motion.div
          className={tileClass}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={label ?? "Upload image"}
          aria-describedby={error ? `${autoId}-error` : undefined}
          aria-disabled={disabled || undefined}
          onClick={hasPreview ? undefined : openPicker}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          animate={
            error && !shouldReduceMotion
              ? { x: [0, -4, 4, -4, 4, 0] }
              : dragOver && !shouldReduceMotion
                ? { scale: 1.02 }
                : { scale: 1, x: 0 }
          }
          transition={shouldReduceMotion ? { duration: 0 } : error ? { duration: 0.4 } : spring}
        >
          {hasPreview ? (
            <>
              <img
                className={styles.preview}
                src={value}
                alt={label ?? "Uploaded image"}
                width="100%"
                height="100%"
                style={isUploading ? { opacity: 0.5 } : undefined}
              />
              {isUploading && (
                <div className={styles.progressContainer}>
                  <div
                    className={styles.progressBar}
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Upload progress"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
              {done && (
                <span
                  className={styles.checkmark}
                  role="status"
                  aria-live="polite"
                  aria-label="Upload complete"
                >
                  <Check size={14} aria-hidden="true" />
                </span>
              )}
              {!isUploading && !done && (
                <button
                  type="button"
                  className={styles.replaceButton}
                  onClick={handleReplace}
                  tabIndex={0}
                >
                  Replace
                </button>
              )}
            </>
          ) : (
            <div className={styles.emptyContent}>
              <div className={styles.addIcon}>
                <Plus size={20} aria-hidden="true" />
              </div>
              <span className={styles.addLabel}>Add image</span>
            </div>
          )}
          {error && !hasPreview && (
            <div
              className={styles.errorOverlay}
              id={`${autoId}-error`}
              role="alert"
              aria-live="assertive"
            >
              <span className={styles.errorIcon} aria-hidden="true">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M2 2l8 8M10 2l-8 8" />
                </svg>
              </span>
              <span className={styles.errorText}>{error}</span>
            </div>
          )}
        </motion.div>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={disabled}
          onChange={handleInputChange}
          className={styles.hiddenInput}
          tabIndex={-1}
          aria-hidden="true"
          id={`${autoId}-input`}
        />

        {(label || hint || (error && hasPreview)) && (
          <div className={styles.meta}>
            {label && <span className={styles.label}>{label}</span>}
            {error && hasPreview ? (
              <span className={styles.hintError}>{error}</span>
            ) : (
              hint && <span className={styles.hint}>{hint}</span>
            )}
          </div>
        )}
      </div>
    );
  }
);

ImageUpload.displayName = "ImageUpload";
