/**
 * GuestLookup — the guest-name field that is also a typeahead over returning guests.
 *
 * Register-compatible: the surface keeps `register("guestName", …)` and spreads the bag here; we
 * forward `ref`/`name`/`onChange`/`onBlur` to rialto `Input` and add the combobox wiring on top.
 * The surface owns prefill and the picked `guestId`; this component owns typing, searching, the
 * portaled listbox and the failure caption (architecture § GuestLookup, ux.md § Copy).
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import type { ChangeHandler, RefCallBack } from "react-hook-form";
import { Input, Text } from "@mattbutlerengineering/rialto";
import { useCombobox } from "@mattbutlerengineering/rialto/hooks";
import type { Guest } from "@mbe/types";
import { useGuestLookup } from "../../hooks/useGuestLookup.js";
import { formatGuestRowDetail } from "./guest-lookup-rows.js";
import styles from "./GuestLookup.module.css";

export const LOOKUP_FAILURE_COPY = "Can't look up guests right now — type the details as usual.";
const LOADING_COPY = "Looking up guests…";
const NO_MATCH_COPY = "No returning guest matches. Carry on as usual.";
const MORE_COPY = "More matches — keep typing to narrow.";
const LISTBOX_LABEL = "Guest suggestions";
const LISTBOX_GAP_PX = 4;

export interface GuestLookupProps {
  venueId: string | null | undefined;
  label: string;
  hint?: string;
  placeholder?: string;
  /** Live field text — the surface's `watch("guestName")`. */
  query: string;
  /** react-hook-form register bag, spread by the surface. */
  name: string;
  ref: RefCallBack;
  onChange: ChangeHandler;
  onBlur: ChangeHandler;
  /** The guest this booking is linked to, if any — wiping the field to "" then calls `onClear`. */
  picked: Guest | null;
  onPick: (guest: Guest) => void;
  onClear: () => void;
  /** The surface's polite region — spoken once per lookup-failure episode. Must be stable. */
  announce: (text: string) => void;
  disabled?: boolean;
  required?: boolean;
  "data-testid"?: string;
}

function clamp(index: number, last: number): number {
  return Math.min(Math.max(index, 0), last);
}

function resultsSentence(count: number): string {
  return `${count} result${count === 1 ? "" : "s"} available`;
}

export function GuestLookup({
  venueId,
  label,
  hint,
  placeholder,
  query,
  name,
  ref,
  onChange,
  onBlur,
  picked,
  onPick,
  onClear,
  announce,
  disabled,
  required,
  "data-testid": testId,
}: GuestLookupProps) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const captionId = `${inputId}-failure`;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const setInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      ref(node);
    },
    [ref]
  );

  // The picked guest's own name is not a search: the surface wrote it, not the Host.
  const lookup = useGuestLookup({ venueId, text: picked && query === picked.name ? "" : query });
  const { rows, hasMore, isLoading, failed } = lookup;
  const last = rows.length - 1;

  const items = rows.map((guest) => ({ value: guest.id, label: guest.name }));
  const { open, focusedIndex, openWithFocus, close, setFocusedIndex } = useCombobox({
    items,
    containerRef,
    extraContainerRefs: [listRef],
  });

  // A settled answer that is not a failure: loading, rows, or a confirmed no-match.
  const hasContent = lookup.query !== "" && !failed;
  const visible = open && hasContent;
  const activeOptionId =
    visible && focusedIndex >= 0 && focusedIndex <= last ? optionId(focusedIndex) : undefined;

  // Failure episode: latched on the first failure, released by the next success or an empty field
  // (derived during render — no setState in an effect).
  const [failureShown, setFailureShown] = useState(false);
  if (failed && !failureShown) {
    setFailureShown(true);
  } else if (failureShown && !failed && (query === "" || lookup.query !== "")) {
    setFailureShown(false);
  }

  useEffect(() => {
    if (failureShown) announce(LOOKUP_FAILURE_COPY);
  }, [failureShown, announce]);

  // Position the portaled list under the input (rialto Select precedent).
  useLayoutEffect(() => {
    if (!visible) return;
    const input = inputRef.current;
    const list = listRef.current;
    if (!input || !list) return;
    const updatePosition = () => {
      const rect = input.getBoundingClientRect();
      list.style.top = `${rect.bottom + LISTBOX_GAP_PX}px`;
      list.style.left = `${rect.left}px`;
      list.style.width = `${rect.width}px`;
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || focusedIndex < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${focusedIndex}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [visible, focusedIndex]);

  const openList = () => {
    openWithFocus();
    setFocusedIndex(-1);
  };

  const pick = (guest: Guest) => {
    close();
    onPick(guest);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    void onChange(event);
    if (picked && event.target.value === "") onClear();
    openList();
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    void onBlur(event);
    close();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (!visible) {
          if (hasContent) openList();
          return;
        }
        if (last < 0) return;
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const fromEdge = delta > 0 ? 0 : last;
        setFocusedIndex(focusedIndex < 0 ? fromEdge : clamp(focusedIndex + delta, last));
        return;
      }
      case "Home":
      case "End":
        if (visible && last >= 0) {
          event.preventDefault();
          setFocusedIndex(event.key === "Home" ? 0 : last);
        }
        return;
      case "Enter": {
        const focused = visible ? rows[focusedIndex] : undefined;
        if (focused) {
          event.preventDefault();
          pick(focused);
        }
        return;
      }
      case "Escape":
        if (visible) event.preventDefault();
        if (open) close();
        return;
      case "Tab":
        if (open) close();
        return;
    }
  };

  const liveMessage = !visible
    ? ""
    : isLoading
      ? LOADING_COPY
      : rows.length === 0
        ? NO_MATCH_COPY
        : resultsSentence(rows.length);

  const describedBy = failureShown
    ? [hint ? `${inputId}-hint` : undefined, captionId].filter(Boolean).join(" ")
    : undefined;

  return (
    <div ref={containerRef} className={styles.field}>
      <Input
        ref={setInputRef}
        id={inputId}
        name={name}
        label={label}
        hint={hint}
        placeholder={placeholder}
        type="text"
        role="combobox"
        aria-expanded={visible}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        autoComplete="off"
        disabled={disabled}
        required={required}
        data-testid={testId}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={() => {
          if (!open && hasContent) openList();
        }}
        onKeyDown={handleKeyDown}
        {...(describedBy ? { "aria-describedby": describedBy } : {})}
      />
      {failureShown && (
        <Text id={captionId} variant="caption" color="secondary" className={styles.caption}>
          {LOOKUP_FAILURE_COPY}
        </Text>
      )}
      <div role="status" aria-live="polite" className={styles.srOnly}>
        {liveMessage}
      </div>
      {visible &&
        createPortal(
          <ul
            ref={listRef}
            id={listboxId}
            className={styles.listbox}
            role="listbox"
            aria-label={LISTBOX_LABEL}
          >
            {isLoading && (
              <li
                className={styles.status}
                role="option"
                aria-selected={false}
                aria-disabled="true"
              >
                {LOADING_COPY}
              </li>
            )}
            {!isLoading && rows.length === 0 && (
              <li
                className={styles.status}
                role="option"
                aria-selected={false}
                aria-disabled="true"
              >
                {NO_MATCH_COPY}
              </li>
            )}
            {rows.map((guest, index) => (
              <li
                key={guest.id}
                id={optionId(index)}
                className={
                  index === focusedIndex ? `${styles.option} ${styles.optionActive}` : styles.option
                }
                role="option"
                aria-selected={index === focusedIndex}
                data-option-index={index}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(guest);
                }}
                onMouseEnter={() => setFocusedIndex(index)}
              >
                <Text as="span" variant="caption" color="primary" className={styles.optionName}>
                  {guest.name}
                </Text>
                <Text as="span" variant="detail" color="secondary">
                  {formatGuestRowDetail(guest)}
                </Text>
              </li>
            ))}
            {hasMore && (
              <li
                className={styles.status}
                role="option"
                aria-selected={false}
                aria-disabled="true"
              >
                {MORE_COPY}
              </li>
            )}
          </ul>,
          document.body
        )}
    </div>
  );
}
