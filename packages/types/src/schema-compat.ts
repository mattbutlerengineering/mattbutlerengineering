/**
 * Semantic backward compatibility checker for JSON Schema objects.
 *
 * Classifies schema changes as breaking or non-breaking:
 *   Breaking:     field removal, type narrowing, new required field, enum narrowing
 *   Non-breaking: optional field addition, description/example changes, new enum values
 */

interface JsonSchemaProperty {
  type?: string;
  enum?: readonly unknown[];
  nullable?: boolean;
  description?: string;
  example?: unknown;
  [key: string]: unknown;
}

interface JsonSchema {
  $id?: string;
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: readonly string[];
  [key: string]: unknown;
}

export interface SchemaChange {
  type: "breaking" | "non-breaking";
  message: string;
}

const COSMETIC_KEYS = new Set(["description", "example", "examples"]);

export function compareSchema(
  schemaId: string,
  baseline: JsonSchema | undefined,
  current: JsonSchema | undefined
): { breaking: string[]; nonBreaking: string[] } {
  const breaking: string[] = [];
  const nonBreaking: string[] = [];

  if (!current) {
    breaking.push(`Schema "${schemaId}" was removed`);
    return { breaking, nonBreaking };
  }

  if (!baseline) {
    nonBreaking.push(`Schema "${schemaId}" is new`);
    return { breaking, nonBreaking };
  }

  const baseProps = baseline.properties ?? {};
  const currProps = current.properties ?? {};
  const baseRequired = new Set(baseline.required ?? []);
  const currRequired = new Set(current.required ?? []);

  // Removed properties
  for (const prop of Object.keys(baseProps)) {
    if (!(prop in currProps)) {
      breaking.push(`${schemaId}: property "${prop}" was removed`);
    }
  }

  // New properties
  for (const prop of Object.keys(currProps)) {
    if (!(prop in baseProps)) {
      if (currRequired.has(prop)) {
        breaking.push(
          `${schemaId}: required property "${prop}" was added (breaks existing clients)`
        );
      } else {
        nonBreaking.push(`${schemaId}: optional property "${prop}" was added`);
      }
    }
  }

  // Required constraint changes on existing fields
  for (const req of currRequired) {
    if (!baseRequired.has(req) && req in baseProps) {
      breaking.push(`${schemaId}: property "${req}" became required (was optional)`);
    }
  }
  for (const req of baseRequired) {
    if (!currRequired.has(req) && req in currProps) {
      nonBreaking.push(`${schemaId}: property "${req}" became optional (was required)`);
    }
  }

  // Property-level changes on shared fields
  for (const prop of Object.keys(baseProps)) {
    if (!(prop in currProps)) continue;
    const baseDef = baseProps[prop];
    const currDef = currProps[prop];

    // Type change
    if (baseDef.type && currDef.type && baseDef.type !== currDef.type) {
      breaking.push(
        `${schemaId}: property "${prop}" type changed from "${baseDef.type}" to "${currDef.type}"`
      );
    }

    // Enum narrowing
    if (baseDef.enum && currDef.enum) {
      const baseSet = new Set(baseDef.enum);
      const currSet = new Set(currDef.enum);
      const removed = [...baseSet].filter((v) => !currSet.has(v));
      const added = [...currSet].filter((v) => !baseSet.has(v));

      if (removed.length > 0) {
        breaking.push(`${schemaId}: property "${prop}" enum values removed: ${removed.join(", ")}`);
      }
      if (added.length > 0) {
        nonBreaking.push(`${schemaId}: property "${prop}" enum values added: ${added.join(", ")}`);
      }
    }

    // Nullable changes
    if (baseDef.nullable === true && currDef.nullable !== true) {
      breaking.push(`${schemaId}: property "${prop}" is no longer nullable`);
    }
    if (baseDef.nullable !== true && currDef.nullable === true) {
      nonBreaking.push(`${schemaId}: property "${prop}" became nullable`);
    }

    // Cosmetic changes
    for (const key of COSMETIC_KEYS) {
      if (JSON.stringify(baseDef[key]) !== JSON.stringify(currDef[key])) {
        nonBreaking.push(`${schemaId}: property "${prop}" ${key} changed`);
      }
    }
  }

  return { breaking, nonBreaking };
}
