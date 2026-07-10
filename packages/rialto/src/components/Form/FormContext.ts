import { createContext, useContext } from "react";

/**
 * Validation context shared between `Form` and its `FormField` descendants.
 * `Form` owns the state; `FormField` registers a validator and reads back
 * the current submit/error state to wire into its wrapped control.
 */
export interface FormContextValue {
  /** True once the form has been submitted at least once. */
  readonly submitAttempted: boolean;
  /** Current error message per field name, populated after a failed submit. */
  readonly errors: Readonly<Record<string, string>>;
  /** Registers (or replaces) a field's validator under `name`. */
  registerField: (name: string, validate: (() => string | undefined) | undefined) => void;
  /** Removes a field's validator, e.g. on unmount. */
  unregisterField: (name: string) => void;
}

export const FormContext = createContext<FormContextValue | null>(null);

/** Reads the enclosing `Form`'s validation context. Throws outside a `<Form>`. */
export function useFormContext(): FormContextValue {
  const ctx = useContext(FormContext);
  if (!ctx) throw new Error("FormField must be used within a <Form>");
  return ctx;
}
