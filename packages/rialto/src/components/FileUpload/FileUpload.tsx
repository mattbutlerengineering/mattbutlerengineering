import { forwardRef, useCallback, useId, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, HTMLAttributes } from "react";
import { X } from "lucide-react";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
import { cn } from "../../utils/class-composer";
import { formatBytes, matchesAccept } from "../../utils/file-validation";
import styles from "./FileUpload.module.css";

/**
 * A labelled file picker with a drop zone and a removable file list, for
 * documents (menus as PDF, CSV imports) or several files at once. Uploading
 * itself is the consumer's job; this reports the accepted `File[]`.
 *
 * @example
 * <FileUpload
 *   label="Menus"
 *   accept=".pdf"
 *   multiple
 *   maxSize={5 * 1024 * 1024}
 *   onFilesChange={setFiles}
 * />
 */
export interface FileUploadProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "defaultValue"
> {
  /** Visible label; also the accessible name of the file input. */
  label: string;
  /** Accepted MIME types, `type/*` wildcards or `.ext` extensions (comma separated). */
  accept?: string;
  /** Maximum size per file in bytes. */
  maxSize?: number;
  /** Allow more than one file. Without it a new file replaces the old one. */
  multiple?: boolean;
  /** Maximum number of files (with `multiple`). */
  maxFiles?: number;
  /** Controlled file list. */
  value?: File[];
  /** Initial file list when uncontrolled. */
  defaultValue?: File[];
  /** Called with the full accepted list after files are added or removed. */
  onFilesChange?: (files: File[]) => void;
  disabled?: boolean;
  /** Error message; sets `aria-invalid` on the input. */
  error?: string;
  hint?: string;
}

export const FileUpload = forwardRef<HTMLDivElement, FileUploadProps>(
  (
    {
      label,
      accept,
      maxSize,
      multiple,
      maxFiles,
      value,
      defaultValue,
      onFilesChange,
      disabled,
      error,
      hint,
      className,
      ...zoneProps
    },
    ref
  ) => {
    const { messages } = useRialtoLocale();
    const autoId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const browseRef = useRef<HTMLButtonElement>(null);
    const [inner, setInner] = useState<File[]>(defaultValue ?? []);
    const [dragging, setDragging] = useState(false);
    const [rejections, setRejections] = useState<string[]>([]);
    const [announcement, setAnnouncement] = useState("");

    const files = value ?? inner;

    const commit = useCallback(
      (next: File[]) => {
        if (value === undefined) setInner(next);
        onFilesChange?.(next);
      },
      [value, onFilesChange]
    );

    const addFiles = useCallback(
      (incoming: File[]) => {
        if (disabled || incoming.length === 0) return;
        const valid: File[] = [];
        const rejected: string[] = [];
        const base = multiple ? files.length : 0;
        for (const file of incoming) {
          let reason: string | null = null;
          if (maxSize !== undefined && file.size > maxSize) {
            reason = messages.fileTooLarge(formatBytes(maxSize), formatBytes(file.size));
          } else if (accept && !matchesAccept(file, accept)) {
            reason = messages.fileTypeNotAccepted(accept);
          } else if (multiple && maxFiles !== undefined && base + valid.length >= maxFiles) {
            reason = messages.tooManyFiles(maxFiles);
          }
          if (reason) rejected.push(messages.fileRejected(file.name, reason));
          else valid.push(file);
        }
        setRejections(rejected);
        const parts: string[] = [];
        if (valid.length > 0) {
          commit(multiple ? [...files, ...valid] : valid.slice(-1));
          parts.push(messages.filesAdded(multiple ? valid.length : 1));
        }
        if (rejected.length > 0) parts.push(messages.filesRejected(rejected.length));
        setAnnouncement(parts.join(". "));
      },
      [accept, commit, disabled, files, maxFiles, maxSize, messages, multiple]
    );

    const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
      addFiles(Array.from(e.target.files ?? []));
      // Reset so picking the same file again still fires change.
      e.target.value = "";
    };

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!disabled) setDragging(true);
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      addFiles(Array.from(e.dataTransfer.files));
    };

    const handleRemove = (index: number) => {
      const removed = files[index];
      commit(files.filter((_, i) => i !== index));
      setRejections([]);
      setAnnouncement(removed ? messages.fileRemoved(removed.name) : "");
      browseRef.current?.focus();
    };

    const hintId = `${autoId}-hint`;
    const errorId = `${autoId}-error`;
    const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

    return (
      <div ref={ref} className={cn(styles.root, className)}>
        <label htmlFor={`${autoId}-input`} className={styles.label}>
          {label}
        </label>
        <div
          {...zoneProps}
          className={cn(styles.zone, error && styles.error, disabled && styles.disabled)}
          data-dragging={dragging ? "true" : undefined}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <button
            ref={browseRef}
            type="button"
            className={styles.browse}
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            {messages.chooseFiles}
          </button>
          <span className={styles.prompt}>{messages.dropFilesHint}</span>
          <input
            ref={inputRef}
            id={`${autoId}-input`}
            type="file"
            className={styles.input}
            accept={accept}
            multiple={multiple}
            disabled={disabled}
            tabIndex={-1}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            onChange={handleInputChange}
          />
        </div>
        {hint && (
          <span id={hintId} className={styles.hint}>
            {hint}
          </span>
        )}
        {error && (
          <span id={errorId} className={styles.errorText}>
            {error}
          </span>
        )}
        {rejections.length > 0 && (
          <div className={styles.rejections}>
            {rejections.map((line) => (
              <p key={line} className={styles.rejection}>
                {line}
              </p>
            ))}
          </div>
        )}
        {files.length > 0 && (
          <ul className={styles.list}>
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className={styles.item}>
                <span className={styles.name}>{file.name}</span>
                <span className={styles.size}>{formatBytes(file.size)}</span>
                <button
                  type="button"
                  className={styles.remove}
                  disabled={disabled}
                  aria-label={messages.removeItem(file.name)}
                  onClick={() => handleRemove(index)}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div role="status" aria-live="polite" className={styles.live}>
          {announcement}
        </div>
      </div>
    );
  }
);

FileUpload.displayName = "FileUpload";
