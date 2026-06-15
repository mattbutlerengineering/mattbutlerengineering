import { useId } from "react";

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
}

/**
 * Headless primitive that owns id generation, label association,
 * hint + error ARIA wiring, and required/optional label markup.
 *
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
 * const { id, labelProps, descriptionProps, errorProps, controlProps, showRequired, showOptional } =
 *   useField({ id: externalId, hint, error, required, showOptional: showOptionalProp });
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
    showRequired: !!required,
    showOptional: !!showOptionalProp && !required,
  };
}
