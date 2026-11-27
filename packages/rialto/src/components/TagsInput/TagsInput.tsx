import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useField } from "../../hooks/useField";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { cn } from "../../utils/class-composer";
import { Tag } from "../Tag/Tag";
import styles from "./TagsInput.module.css";

/**
 * Free-text tags entry: type a value and press Enter or `,` to commit it as a
 * removable chip. Use it for open-ended notes such as guest dietary needs or
 * venue tags. For picking from a fixed list use `Combobox multiple` instead.
 *
 * @example
 * <TagsInput label="Dietary notes" onValueChange={setTags} maxTags={5} />
 */
export interface TagsInputProps {
  label: string;
  /** Controlled tags */
  value?: string[];
  /** Initial tags when uncontrolled */
  defaultValue?: string[];
  /** Called with the full tag list after every add or remove */
  onValueChange?: (tags: string[]) => void;
  /** Maximum number of tags; further commits are rejected */
  maxTags?: number;
  /** Allow the same tag (compared case-insensitively) more than once */
  allowDuplicates?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /** Applies error styling and sets `aria-invalid` */
  error?: boolean;
  /** Helper text; doubles as the error message when `error` is set */
  hint?: string;
  className?: string;
}

export const TagsInput = forwardRef<HTMLInputElement, TagsInputProps>(
  (
    {
      label,
      value,
      defaultValue,
      onValueChange,
      maxTags,
      allowDuplicates = false,
      placeholder,
      disabled,
      error,
      hint,
      className,
    },
    ref
  ) => {
    const { messages } = useRialtoLocale();
    const motionPreset = useMotionPreset();
    const field = useField({ hint, error });
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const [internal, setInternal] = useState<string[]>(defaultValue ?? []);
    const [draft, setDraft] = useState("");
    const [announcement, setAnnouncement] = useState({ text: "", flip: false });
    // Same text twice must still change the live region's content to be re-read.
    const announce = useCallback(
      (text: string) => setAnnouncement((a) => ({ text, flip: !a.flip })),
      []
    );
    const tags = value ?? internal;
    const atLimit = maxTags !== undefined && tags.length >= maxTags;

    const update = useCallback(
      (next: string[]) => {
        if (value === undefined) setInternal(next);
        onValueChange?.(next);
      },
      [value, onValueChange]
    );

    const commit = useCallback(
      (pieces: string[]) => {
        let next = tags;
        const notes: string[] = [];
        for (const raw of pieces) {
          const text = raw.trim();
          if (!text) continue;
          if (maxTags !== undefined && next.length >= maxTags) {
            notes.push(messages.tagLimitReached(maxTags));
            break;
          }
          if (!allowDuplicates && next.some((t) => t.toLowerCase() === text.toLowerCase())) {
            notes.push(messages.tagDuplicate(text));
            continue;
          }
          next = [...next, text];
          notes.push(messages.tagAdded(text));
        }
        if (next !== tags) update(next);
        if (notes.length) announce(notes.join(". "));
        setDraft("");
      },
      [tags, maxTags, allowDuplicates, messages, update, announce]
    );

    const removeAt = (index: number) => {
      const removed = tags[index];
      if (removed === undefined) return;
      update(tags.filter((_, i) => i !== index));
      announce(messages.tagRemoved(removed));
      inputRef.current?.focus();
    };

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        if (e.key === "," || draft.trim()) e.preventDefault();
        commit([draft]);
      } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
        removeAt(tags.length - 1);
      }
    };

    const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
      const text = e.clipboardData.getData("text");
      if (!/[,\n]/.test(text)) return;
      e.preventDefault();
      commit(`${draft}${text}`.split(/[,\n]/));
    };

    // Key by text plus occurrence among equal tags, so removing a chip never re-keys later ones.
    const seen = new Map<string, number>();
    const chipKeys = tags.map((tag) => {
      const lower = tag.toLowerCase();
      const n = seen.get(lower) ?? 0;
      seen.set(lower, n + 1);
      return `${lower}#${n}`;
    });

    return (
      <div className={cn(styles.wrapper, error && styles.error, className)}>
        <label {...field.labelProps} className={styles.label}>
          {label}
        </label>
        <div className={cn(styles.box, disabled && styles.disabled)}>
          {tags.length > 0 && (
            // role kept: `display: contents` drops list semantics in Safari/VoiceOver
            // eslint-disable-next-line jsx-a11y/no-redundant-roles
            <ul role="list" className={styles.list}>
              <AnimatePresence initial={false}>
                {tags.map((tag, i) => (
                  <motion.li
                    key={chipKeys[i]}
                    className={styles.item}
                    initial={motionPreset.reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={motionPreset.reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                    transition={motionPreset.spring}
                  >
                    <Tag dismissible={!disabled} onDismiss={() => removeAt(i)}>
                      {tag}
                    </Tag>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
          <input
            ref={inputRef}
            {...field.controlProps}
            className={styles.input}
            type="text"
            value={draft}
            placeholder={placeholder}
            disabled={disabled || undefined}
            aria-disabled={atLimit || undefined}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
          />
        </div>
        {hint &&
          (error ? (
            <span key="error" {...field.errorProps} className={styles.hint}>
              {hint}
            </span>
          ) : (
            <span key="hint" {...field.descriptionProps} className={styles.hint}>
              {hint}
            </span>
          ))}
        <span {...field.liveRegionProps}>
          {announcement.text}
          {announcement.flip ? "\u00a0" : ""}
        </span>
      </div>
    );
  }
);
TagsInput.displayName = "TagsInput";
