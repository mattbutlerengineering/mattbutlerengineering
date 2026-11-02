import { forwardRef, useCallback, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Plus } from "lucide-react";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
import { useMotionPreset } from "../../providers/useMotionPreset";
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
    const { messages } = useRialtoLocale();
    const autoId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const { spring, reduced: shouldReduceMotion } = useMotionPreset();

    const hasPreview = Boolean(value);
    const isUploading = progress !== undefined && progress < 100;

    const validate = useCallback(
      (file: File): boolean => {
        if (maxSize && file.size > maxSize) {
          onValidationError?.(messages.fileTooLarge(formatBytes(maxSize), formatBytes(file.size)));
          return false;
        }
        if (accept && !matchesAccept(file, accept)) {
          onValidationError?.(messages.fileTypeNotAccepted(accept));
          return false;
        }
        return true;
      },
      [accept, maxSize, messages, onValidationError]
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
        <div className={styles.frame}>
          <motion.div
            className={tileClass}
            // Only the empty tile is a control. The preview tile holds the Replace
            // button, so it must not be a role=button itself (nested-interactive).
            role={hasPreview ? undefined : "button"}
            tabIndex={hasPreview ? undefined : disabled ? -1 : 0}
            // The name is built from the visible "Add image" text (plus the label),
            // so it always contains what sighted users read (label-content-name-mismatch).
            aria-labelledby={
              hasPreview ? undefined : label ? `${autoId}-add ${autoId}-label` : `${autoId}-add`
            }
            aria-describedby={error ? `${autoId}-error` : undefined}
            aria-disabled={hasPreview ? undefined : disabled || undefined}
            onClick={hasPreview ? undefined : openPicker}
            onKeyDown={hasPreview ? undefined : handleKeyDown}
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
            transition={error && !shouldReduceMotion ? { duration: 0.4 } : spring}
          >
            {hasPreview ? (
              <>
                <img
                  className={styles.preview}
                  src={value}
                  alt={label ?? messages.uploadedImage}
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
                      aria-label={messages.uploadProgress}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
                {done && (
                  <span
                    className={styles.checkmark}
                    role="status"
                    aria-live="polite"
                    aria-label={messages.uploadComplete}
                  >
                    <Check size={14} aria-hidden="true" />
                  </span>
                )}
                {!isUploading && !done && (
                  <button
                    type="button"
                    className={styles.replaceButton}
                    onClick={handleReplace}
                    disabled={disabled}
                  >
                    {messages.replaceImage}
                  </button>
                )}
              </>
            ) : (
              <div className={styles.emptyContent}>
                <div className={styles.addIcon}>
                  <Plus size={20} aria-hidden="true" />
                </div>
                <span id={`${autoId}-add`} className={styles.addLabel}>
                  {messages.addImage}
                </span>
              </div>
            )}
          </motion.div>
          {/* Outside the role=button tile: its text would otherwise count as part of the
              tile's visible label and trip label-content-name-mismatch. */}
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
        </div>

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
            {label && (
              <span id={`${autoId}-label`} className={styles.label}>
                {label}
              </span>
            )}
            {error && hasPreview ? (
              <span id={`${autoId}-error`} className={styles.hintError}>
                {error}
              </span>
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
