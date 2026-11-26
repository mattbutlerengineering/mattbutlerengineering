import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type HTMLAttributes,
  type KeyboardEvent,
} from "react";
import { useRialtoLocale } from "../../i18n/RialtoLocaleProvider";
import { cn } from "../../utils/class-composer";
import styles from "./Listbox.module.css";

export interface ListboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Always-visible listbox (WAI-ARIA APG Listbox). One Tab stop; focus stays on the
 * listbox and `aria-activedescendant` tracks the active option. Single selection
 * follows focus; `multiple` adds Space, Shift+Arrow and Ctrl/Cmd+A.
 *
 * @example
 * <Listbox aria-label="Section" options={[{ value: "bar", label: "Bar" }]} onValueChange={setSection} />
 */
export interface ListboxProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "role" | "defaultValue" | "onChange" | "aria-multiselectable"
> {
  /** Options in display order. */
  options: readonly ListboxOption[];
  /** Allow several selected options; `value` is then a string array. */
  multiple?: boolean;
  /** Controlled value (string, or string[] when `multiple`). */
  value?: string | readonly string[];
  /** Uncontrolled initial value. */
  defaultValue?: string | readonly string[];
  /** Called with the new value (string, or string[] when `multiple`). */
  onValueChange?: (value: string | string[]) => void;
}

const TYPEAHEAD_RESET_MS = 500;

function toList(v: string | readonly string[] | undefined): string[] {
  if (v === undefined) return [];
  return typeof v === "string" ? [v] : [...v];
}

export const Listbox = forwardRef<HTMLDivElement, ListboxProps>(
  (
    {
      options,
      multiple = false,
      value,
      defaultValue,
      onValueChange,
      className,
      onKeyDown,
      onFocus,
      ...rest
    },
    ref
  ) => {
    const { messages } = useRialtoLocale();
    const baseId = useId();
    const [inner, setInner] = useState<string[]>(() => toList(defaultValue));
    const [active, setActive] = useState(-1);
    const typed = useRef({ text: "", at: 0 });
    const listRef = useRef<HTMLDivElement | null>(null);

    const selected = value === undefined ? inner : toList(value);
    const optionId = (i: number) => `${baseId}-opt-${i}`;
    const enabled = (i: number) => options[i] !== undefined && !options[i]?.disabled;
    const firstEnabled = () => options.findIndex((_, i) => enabled(i));
    const lastEnabled = () =>
      options
        .map((_, i) => i)
        .reverse()
        .find(enabled) ?? -1;

    useEffect(() => {
      if (active < 0) return;
      document.getElementById(`${baseId}-opt-${active}`)?.scrollIntoView?.({ block: "nearest" });
    }, [active, baseId]);

    const commit = (next: string[]) => {
      if (value === undefined) setInner(next);
      onValueChange?.(multiple ? next : (next[0] ?? ""));
    };

    const selectOnly = (i: number) => {
      const opt = options[i];
      if (opt) commit([opt.value]);
    };

    const toggle = (i: number) => {
      const opt = options[i];
      if (!opt) return;
      if (!multiple) return commit([opt.value]);
      commit(
        selected.includes(opt.value)
          ? selected.filter((v) => v !== opt.value)
          : options.map((o) => o.value).filter((v) => v === opt.value || selected.includes(v))
      );
    };

    const move = (target: number, extend: boolean) => {
      if (target < 0 || target === active) return;
      setActive(target);
      if (!multiple) return selectOnly(target);
      const opt = options[target];
      if (extend && opt && !selected.includes(opt.value)) {
        commit(options.map((o) => o.value).filter((v) => v === opt.value || selected.includes(v)));
      }
    };

    const step = (dir: 1 | -1): number => {
      for (let i = active + dir; i >= 0 && i < options.length; i += dir) {
        if (enabled(i)) return i;
      }
      return active;
    };

    const handleFocus = (e: FocusEvent<HTMLDivElement>) => {
      onFocus?.(e);
      if (e.target !== e.currentTarget || active >= 0) return;
      const sel = options.findIndex((o, i) => enabled(i) && selected.includes(o.value));
      setActive(sel >= 0 ? sel : firstEnabled());
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;
      const key = e.key;
      let handled = true;
      if (key === "ArrowDown") move(step(1), e.shiftKey);
      else if (key === "ArrowUp") move(step(-1), e.shiftKey);
      else if (key === "Home") move(firstEnabled(), false);
      else if (key === "End") move(lastEnabled(), false);
      else if (key === " " && active >= 0 && enabled(active)) toggle(active);
      else if (multiple && (e.ctrlKey || e.metaKey) && key.toLowerCase() === "a") {
        commit(options.filter((o) => !o.disabled).map((o) => o.value));
      } else if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && key !== " ") {
        const now = Date.now();
        const t = typed.current;
        t.text = now - t.at > TYPEAHEAD_RESET_MS ? key : t.text + key;
        t.at = now;
        const needle = t.text.toLowerCase();
        const from = t.text.length > 1 ? active : active + 1;
        for (let n = 0; n < options.length; n++) {
          const i = (Math.max(from, 0) + n) % options.length;
          if (enabled(i) && options[i]?.label.toLowerCase().startsWith(needle)) {
            move(i, false);
            break;
          }
        }
      } else handled = false;
      if (handled) e.preventDefault();
    };

    return (
      <div
        {...rest}
        ref={(node) => {
          listRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        role="listbox"
        tabIndex={0}
        aria-multiselectable={multiple ? "true" : undefined}
        aria-activedescendant={active >= 0 && options[active] ? optionId(active) : undefined}
        className={cn(styles.listbox, className)}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
      >
        {options.length === 0 ? (
          <div className={styles.empty}>{messages.noOptions}</div>
        ) : (
          options.map((opt, i) => {
            const isSelected = selected.includes(opt.value);
            return (
              // Keyboard is handled on the listbox; options use aria-activedescendant, not focus (APG).
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
              <div
                key={opt.value}
                id={optionId(i)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled ? "true" : undefined}
                className={cn(
                  styles.option,
                  isSelected && styles.selected,
                  i === active && styles.active,
                  opt.disabled && styles.disabled
                )}
                onClick={() => {
                  if (opt.disabled) return;
                  setActive(i);
                  toggle(i);
                }}
              >
                {opt.label}
              </div>
            );
          })
        )}
      </div>
    );
  }
);

Listbox.displayName = "Listbox";
