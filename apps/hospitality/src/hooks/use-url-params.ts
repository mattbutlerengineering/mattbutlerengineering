import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { ZodType } from "zod";
import { type ZodObject, type ZodRawShape, type z } from "zod";

type SchemaOutput<S extends ZodObject<ZodRawShape>> = z.infer<S>;

export interface UseUrlParamsResult<S extends ZodObject<ZodRawShape>> {
  params: SchemaOutput<S>;
  setParam: <K extends keyof SchemaOutput<S>>(key: K, value: SchemaOutput<S>[K]) => void;
}

/**
 * Declarative URL filter state backed by a Zod schema.
 * Parses each URL param individually, falling back to defaults on invalid values.
 * setParam updates a single key while preserving other params.
 */
export function useUrlParams<S extends ZodObject<ZodRawShape>>(
  schema: S,
  defaults: SchemaOutput<S>
): UseUrlParamsResult<S> {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo((): SchemaOutput<S> => {
    const shape = schema.shape;
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(shape)) {
      const rawValue = searchParams.get(key);
      if (rawValue === null) {
        result[key] = defaults[key];
        continue;
      }
      const fieldSchema = shape[key] as ZodType;
      const parsed = fieldSchema.safeParse(rawValue);
      result[key] = parsed.success ? parsed.data : defaults[key];
    }

    return result as SchemaOutput<S>;
  }, [searchParams, schema, defaults]);

  const setParam = <K extends keyof SchemaOutput<S>>(key: K, value: SchemaOutput<S>[K]): void => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(key as string, String(value));
      return next;
    });
  };

  return { params, setParam };
}
