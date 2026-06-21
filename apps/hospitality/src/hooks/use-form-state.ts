import { useState, useCallback, useMemo } from "react";
import type { ZodSchema } from "zod";
import { ApiClientError } from "@mbe/api-client";

export interface UseFormStateResult<T extends Record<string, unknown>> {
  fields: T;
  setField: <K extends keyof T>(key: K, value: T[K]) => void;
  isPending: boolean;
  error: string | null;
  isDirty: boolean;
  handleSubmit: () => Promise<void>;
  reset: () => void;
}

export function useFormState<T extends Record<string, unknown>>(
  initialData: T,
  onSubmit: (data: T) => Promise<void>,
  schema: ZodSchema<T>
): UseFormStateResult<T> {
  const [fields, setFields] = useState<T>(initialData);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setFields(initialData);
    setError(null);
  }, [initialData]);

  const handleSubmit = useCallback(async () => {
    if (isPending) return;
    const parsed = schema.safeParse(fields);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Validation failed");
      return;
    }

    setIsPending(true);
    setError(null);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.problemDetails.detail ?? err.response.message);
      } else {
        setError(err instanceof Error ? err.message : "An error occurred");
      }
    } finally {
      setIsPending(false);
    }
  }, [fields, onSubmit, schema, isPending]);

  const isDirty = useMemo(
    () => Object.keys(initialData).some((key) => fields[key] !== initialData[key]),
    [initialData, fields]
  );

  return { fields, setField, isPending, error, isDirty, handleSubmit, reset };
}
