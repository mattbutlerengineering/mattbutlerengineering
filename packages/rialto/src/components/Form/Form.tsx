import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type FormHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "../../utils/class-composer";
import { FormContext } from "./FormContext";
import styles from "./Form.module.css";

export interface FormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit"> {
  /** Called with the submit event once every registered field passes validation. */
  onValidSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** Renders an accessible summary of current field errors above the fields. Default true. */
  showErrorSummary?: boolean;
  children: ReactNode;
}

/**
 * Owns submit-time validation across its `FormField` descendants: collects
 * each field's error, blocks submission while any field is invalid, and
 * announces failures through an assertive error summary.
 *
 * @example
 * <Form onValidSubmit={handleSubmit}>
 *   <FormField name="email" validate={() => (email ? undefined : "Email is required")}>
 *     <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
 *   </FormField>
 *   <Button type="submit">Submit</Button>
 * </Form>
 */
export function Form({
  onValidSubmit,
  showErrorSummary = true,
  children,
  className,
  ...props
}: FormProps) {
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const registryRef = useRef(new Map<string, (() => string | undefined) | undefined>());

  const registerField = useCallback(
    (name: string, validate: (() => string | undefined) | undefined) => {
      registryRef.current.set(name, validate);
    },
    []
  );

  const unregisterField = useCallback((name: string) => {
    registryRef.current.delete(name);
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    for (const [name, validate] of registryRef.current) {
      const message = validate?.();
      if (message) nextErrors[name] = message;
    }
    setErrors(nextErrors);
    setSubmitAttempted(true);
    if (Object.keys(nextErrors).length === 0) {
      onValidSubmit?.(event);
    }
  };

  const contextValue = useMemo(
    () => ({ submitAttempted, errors, registerField, unregisterField }),
    [submitAttempted, errors, registerField, unregisterField]
  );

  const errorEntries = submitAttempted ? Object.entries(errors) : [];

  return (
    <FormContext.Provider value={contextValue}>
      <form {...props} className={cn(styles.form, className)} onSubmit={handleSubmit} noValidate>
        {showErrorSummary && (
          <div role="alert" aria-live="assertive" className={styles.errorSummary}>
            {errorEntries.length > 0 && (
              <>
                <p className={styles.errorSummaryTitle}>
                  {errorEntries.length === 1
                    ? "1 field needs attention"
                    : `${errorEntries.length} fields need attention`}
                </p>
                <ul className={styles.errorSummaryList}>
                  {errorEntries.map(([name, message]) => (
                    <li key={name}>{message}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {children}
      </form>
    </FormContext.Provider>
  );
}

Form.displayName = "Form";
