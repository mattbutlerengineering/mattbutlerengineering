/**
 * Reads ../rialto/dist/manifest.json and generates a concise component
 * reference markdown file at generated/component-reference.md.
 *
 * Filters out inherited HTML/React props to keep only component-specific
 * props (required, described, or with non-trivial types).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = resolve(__dirname, "../../rialto/dist/manifest.json");
const OUTPUT_DIR = resolve(__dirname, "../generated");
const OUTPUT_PATH = resolve(OUTPUT_DIR, "component-reference.md");

// Common HTML/React props to exclude from the reference
const EXCLUDED_PROPS = new Set([
  "className",
  "style",
  "id",
  "children",
  "key",
  "ref",
  "tabIndex",
  "title",
  "role",
  "hidden",
  "dir",
  "lang",
  "slot",
  "translate",
  "draggable",
  "spellCheck",
  "autoFocus",
  "autoCapitalize",
  "contentEditable",
  "contextMenu",
  "enterKeyHint",
  "nonce",
  "accessKey",
  "inputMode",
  "is",
  "radioGroup",
  "about",
  "content",
  "datatype",
  "inlist",
  "prefix",
  "property",
  "rel",
  "resource",
  "rev",
  "typeof",
  "vocab",
  "color",
  "itemProp",
  "itemScope",
  "itemType",
  "itemID",
  "itemRef",
  "results",
  "security",
  "unselectable",
  "popover",
  "popoverTarget",
  "popoverTargetAction",
  "defaultChecked",
  "defaultValue",
  "suppressContentEditableWarning",
  "suppressHydrationWarning",
]);

// Event handler prefixes to exclude
const EVENT_PREFIXES = ["on", "aria-"];

interface ManifestProp {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: string;
}

interface CharacterLimit {
  prop: string;
  max: number;
  reason?: string;
}

interface ManifestSlot {
  name: string;
  description?: string;
}

interface ManifestComponent {
  name: string;
  description?: string;
  props: ManifestProp[];
  slots?: ManifestSlot[];
  characterLimits?: CharacterLimit[];
}

interface Manifest {
  version: string;
  generatedAt: string;
  components: ManifestComponent[];
}

function isRelevantProp(prop: ManifestProp): boolean {
  if (EXCLUDED_PROPS.has(prop.name)) return false;
  if (EVENT_PREFIXES.some((prefix) => prop.name.startsWith(prefix))) return false;
  // Keep required props, props with descriptions, and props with non-trivial types
  if (prop.required) return true;
  if (prop.description) return true;
  return false;
}

const MAX_TYPE_DISPLAY_LENGTH = 60;

function formatType(type: string): string {
  const cleaned = type.replace(/ \| undefined$/, "");
  if (cleaned.length > MAX_TYPE_DISPLAY_LENGTH) {
    return cleaned.slice(0, MAX_TYPE_DISPLAY_LENGTH - 3) + "...";
  }
  return cleaned;
}

function generateComponentSection(component: ManifestComponent): string {
  const lines: string[] = [];
  lines.push(`### ${component.name}`);
  lines.push("");

  if (component.description) {
    // Clean up JSDoc artifacts
    const desc = component.description
      .replace(/\n\{@link\s+/g, " ")
      .replace(/\s*\}\s*/g, " ")
      .replace(/\n/g, " ")
      .trim();
    lines.push(desc);
    lines.push("");
  }

  const relevantProps = component.props.filter(isRelevantProp);

  if (relevantProps.length > 0) {
    lines.push("| Prop | Type | Required | Description |");
    lines.push("|------|------|----------|-------------|");
    for (const prop of relevantProps) {
      const type = formatType(prop.type);
      const req = prop.required ? "Yes" : "";
      const desc = prop.description?.replace(/\n/g, " ").trim() ?? "";
      lines.push(`| \`${prop.name}\` | \`${type}\` | ${req} | ${desc} |`);
    }
    lines.push("");
  }

  const namedSlots = (component.slots ?? []).filter((s) => s.name);
  if (namedSlots.length > 0) {
    lines.push("**Slots:**");
    for (const slot of namedSlots) {
      const desc = slot.description ? ` — ${slot.description}` : "";
      lines.push(`- \`${slot.name}\`${desc}`);
    }
    lines.push("");
  }

  if (component.characterLimits && component.characterLimits.length > 0) {
    lines.push("**Character Limits:**");
    for (const limit of component.characterLimits) {
      const reason = limit.reason ? ` (${limit.reason})` : "";
      lines.push(`- \`${limit.prop}\`: max ${limit.max} chars${reason}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function generate(): void {
  console.log(`Reading manifest from ${MANIFEST_PATH}`);

  let raw: string;
  try {
    raw = readFileSync(MANIFEST_PATH, "utf-8");
  } catch (err) {
    console.error(`Failed to read manifest at ${MANIFEST_PATH}: ${err}`);
    process.exit(1);
  }

  let manifest: Manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to parse manifest JSON: ${err}`);
    process.exit(1);
  }

  const header = [
    "# Rialto Component Reference",
    "",
    `> Auto-generated from manifest v${manifest.version} on ${new Date().toISOString().split("T")[0]}`,
    "> Do not edit — run `pnpm generate` to regenerate.",
    "",
    "---",
    "",
  ].join("\n");

  const sections = manifest.components
    .filter((c) => c.props.length > 0 || (c.characterLimits && c.characterLimits.length > 0))
    .map(generateComponentSection);

  const output = header + sections.join("---\n\n");

  // Skip write if output is unchanged (avoids unnecessary cache invalidation)
  mkdirSync(OUTPUT_DIR, { recursive: true });
  if (existsSync(OUTPUT_PATH)) {
    const existing = readFileSync(OUTPUT_PATH, "utf-8");
    if (existing === output) {
      console.log("Output unchanged — skipping write.");
      return;
    }
  }

  writeFileSync(OUTPUT_PATH, output, "utf-8");
  console.log(
    `Generated ${OUTPUT_PATH} (${manifest.components.length} components, ${sections.length} with props)`
  );
}

generate();
