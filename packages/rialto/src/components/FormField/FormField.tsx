import { cloneElement, useEffect, type ReactElement } from "react";
import { useField } from "../../hooks/useField";
import { useFormContext } from "../Form/FormContext";

/** Props every supported field element (Input, TextArea, NumberInput, Select, Combobox) accepts. */
export interface FormFieldChildProps {
  id?: string;
  error?: boolean;
  hint?: string;
}

export interface FormFieldProps {
  /** Unique field name; keys this field's error in the enclosing Form's validation state. */
  name: string;
  /** Runs at submit time; return an error message, or undefined when the field is valid. */
  validate?: () => string | undefined;
  /** A single field element — Input, TextArea, NumberInput, Select, or Combobox. */
  children: ReactElement<FormFieldChildProps>;
}

/**
 * Connects a single field element to the enclosing `Form`'s validation
 * context: registers `validate` under `name`, then forwards the resulting
 * `id`, `error`, and `hint` (the validation message) onto the field so its
 * own label/hint/error wiring (via its internal `useField`) picks them up.
 *
 * @example
 * <FormField name="email" validate={() => (email ? undefined : "Email is required")}>
 *   <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
 * </FormField>
 */
export function FormField({ name, validate, children }: FormFieldProps) {
  const { submitAttempted, errors, registerField, unregisterField } = useFormContext();
  // Reuses the same id-generation authority every field control already calls
  // internally, so an id we inject matches what the control would derive on
  // its own — the shared source of truth the label/hint/error wiring hangs off.
  const { id } = useField({ id: children.props.id });

  useEffect(() => {
    registerField(name, validate);
    return () => unregisterField(name);
  }, [name, validate, registerField, unregisterField]);

  const hasError = submitAttempted && !!errors[name];

  return cloneElement(children, {
    id,
    error: hasError || children.props.error,
    hint: hasError ? errors[name] : children.props.hint,
  });
}

FormField.displayName = "FormField";
