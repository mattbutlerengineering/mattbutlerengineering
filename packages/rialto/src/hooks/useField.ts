import { createElement, useId, type ReactElement } from "react";
import styles from "./useField.module.css";

/**
 * Options for the useField hook.
 */
export interface UseFieldOptions {
  /** Explicit id; auto-generated if omitted. */
  id?: string;
  /** Helper text rendered below the control. */
  hint?: string;
  /** When true, applies aria-invalid and wires the error region into aria-describedby. */
  error?: boolean;
  /** When true, the control is required; required marker is shown in label. */
  required?: boolean;
  /**
   * When true and not required, shows "(optional)" after the label.
   * Always false when required=true (mutually exclusive).
   */
  showOptional?: boolean;
}

/**
 * Props spread onto a `<label>` element.
 */
export interface FieldLabelProps {
  htmlFor: string;
}

/**
 * Props spread onto the hint/description element (e.g. `<span>`).
 * `id` is always the stable hint id.
 */
export interface FieldDescriptionProps {
  id: string;
}

/**
 * Props spread onto the error message element (e.g. `<span role="alert">`).
 * `id` is undefined when error=false — the element should not be rendered.
 */
export interface FieldErrorProps {
  id: string | undefined;
}

/**
 * Props spread onto the native control (input, textarea, etc.).
 */
export interface FieldControlProps {
  id: string;
  required: boolean | undefined;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
}

/**
 * Descriptor spread onto a visually-hidden aria-live region element.
 * Renders as `<div {...liveRegionProps}>{message}</div>`; the polite `status`
 * role announces async state changes (error appearance, counter, completion)
 * consistently across every field.
 */
export interface FieldLiveRegionProps {
  id: string;
  className: string;
  role: "status";
  "aria-live": "polite";
}

/**
 * Result returned by useField.
 */
export interface UseFieldResult {
  /** Stable control id. */
  readonly id: string;
  /** Props for the `<label>` element. */
  readonly labelProps: FieldLabelProps;
  /** Props for the hint/description element (always rendered when hint exists). */
  readonly descriptionProps: FieldDescriptionProps;
  /** Props for the error message element. `errorProps.id` is undefined when error=false. */
  readonly errorProps: FieldErrorProps;
  /** Props to spread onto the native control. */
  readonly controlProps: FieldControlProps;
  /** Whether to render the required asterisk (*) in the label. */
  readonly showRequired: boolean;
  /**
   * Whether to render the "(optional)" suffix in the label.
   * Always false when required=true.
   */
  readonly showOptional: boolean;
  /**
   * Consistent required-marker element (aria-hidden `*`), or `null` when the
   * field is not required. Render inside the `<label>`: `{field.requiredMarker}`.
   */
  readonly requiredMarker: ReactElement | null;
  /** Descriptor for a visually-hidden polite aria-live region. */
  readonly liveRegionProps: FieldLiveRegionProps;
  /**
   * Default async announcement: the error text when `error=true` (else `""`).
   * Fields with extra async state (counter, completion) compose their own
   * message and fall back to this for the error case.
   */
  readonly liveMessage: string;
}

/**
 * Headless primitive that owns id generation, label association,
 * hint + error ARIA wiring, required/optional label markup, a consistent
 * required-marker element, and a polite aria-live region descriptor so every
 * field announces async state (error appearance, counter, completion) identically.
 * The hint element and error element share the same stable id (`${id}-hint`).
 * When `error=true`:
 * - `controlProps["aria-invalid"]` is set to `true`
 * - `errorProps.id` is `${id}-hint` (same element, now acting as error region)
 * - `controlProps["aria-describedby"]` includes that id
 *
 * This fixes the previously missing error-message association:
 * previously `aria-invalid` was set but no `aria-describedby` pointed to the
 * error text when `hint` was absent.
 *
 * @example
 * const { id, labelProps, controlProps, requiredMarker, liveRegionProps, liveMessage } =
 *   useField({ id: externalId, hint, error, required, showOptional: showOptionalProp });
 * // <label {...labelProps}>{label}{requiredMarker}</label>
 * // <div {...liveRegionProps}>{liveMessage}</div>
 */
export function useField({
  id: externalId,
  hint,
  error,
  required,
  showOptional: showOptionalProp,
}: UseFieldOptions): UseFieldResult {
  const autoId = useId();
  const id = externalId ?? autoId;

  // A single hint/error region id. When error=true this element serves as
  // the error message region; when error=false it is the description region.
  const hintId = `${id}-hint`;

  // aria-describedby is set only when the hint element will be rendered (hint text present).
  // When error=true, aria-invalid signals the invalid state; the hint text (if any) doubles
  // as the error message and is referenced via aria-describedby.
  const describedBy = hint ? hintId : undefined;

  const showRequired = !!required;
  // A single, consistent required marker owned here so no field re-implements it.
  const requiredMarker = showRequired
    ? createElement("span", { className: styles.required, "aria-hidden": "true" }, " *")
    : null;

  return {
    id,
    labelProps: { htmlFor: id },
    descriptionProps: { id: hintId },
    // errorProps.id is only exposed when error=true so callers know the
    // element should receive role="alert" / be identified as the error region.
    errorProps: { id: error ? hintId : undefined },
    controlProps: {
      id,
      required: required || undefined,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": describedBy,
    },
    showRequired,
    showOptional: !!showOptionalProp && !required,
    requiredMarker,
    liveRegionProps: {
      id: `${id}-live`,
      className: styles.liveRegion ?? "",
      role: "status",
      "aria-live": "polite",
    },
    // Default async announcement: error text when invalid, else nothing.
    liveMessage: error && hint ? hint : "",
  };
}
