import { describe, it, expect, vi } from "vitest";
import { usePropsFromManifest } from "./use-props-from-manifest.js";

vi.mock("@mattbutlerengineering/rialto/manifest", () => ({
  default: {
    version: "0.2.0",
    generatedAt: "2026-06-19T00:00:00.000Z",
    components: [
      {
        name: "Button",
        description: "A button component.",
        props: [
          {
            name: "variant",
            type: '"primary" | "secondary" | "ghost" | undefined',
            required: false,
            description: "Visual style.",
          },
          { name: "size", type: '"sm" | "md" | "lg" | undefined', required: false },
          { name: "disabled", type: "boolean | undefined", required: false },
        ],
        slots: [],
      },
      {
        name: "Input",
        description: "An input component.",
        props: [
          { name: "label", type: "string | undefined", required: false },
          {
            name: "error",
            type: "boolean | undefined",
            required: false,
            description: "Error styling.",
          },
        ],
        slots: [],
      },
      {
        name: "PreFilteredComponent",
        description: "Manifest entries arrive pre-filtered to the real component API.",
        props: [
          {
            name: "variant",
            type: '"primary" | "secondary" | undefined',
            required: false,
            description: "Visual style.",
          },
          { name: "size", type: '"sm" | "md" | undefined', required: false },
          // A legit prop whose name matches a former HTML-noise sentinel must
          // still be returned — the hook no longer truncates on prop names.
          { name: "defaultValue", type: "string | undefined", required: false },
        ],
        slots: ["children"],
      },
    ],
  },
}));

describe("usePropsFromManifest", () => {
  it("returns props for a known component", () => {
    const props = usePropsFromManifest("Button");
    expect(props).toHaveLength(3);
    expect(props[0]?.name).toBe("variant");
    expect(props[1]?.name).toBe("size");
    expect(props[2]?.name).toBe("disabled");
  });

  it("preserves description from manifest when present", () => {
    const props = usePropsFromManifest("Button");
    const variantProp = props.find((p) => p.name === "variant");
    expect(variantProp?.description).toBe("Visual style.");
  });

  it("returns empty string for description when absent in manifest", () => {
    const props = usePropsFromManifest("Button");
    const sizeProp = props.find((p) => p.name === "size");
    expect(sizeProp?.description).toBe("");
  });

  it("returns empty array for unknown component", () => {
    const props = usePropsFromManifest("NonExistentComponent");
    expect(props).toEqual([]);
  });

  it("returns props for Input component", () => {
    const props = usePropsFromManifest("Input");
    expect(props).toHaveLength(2);
    expect(props[0]?.name).toBe("label");
  });

  it("strips | undefined from type strings for cleaner display", () => {
    const props = usePropsFromManifest("Button");
    const variantProp = props.find((p) => p.name === "variant");
    expect(variantProp?.type).not.toContain("| undefined");
  });

  it("returns every prop verbatim, without truncation (manifest is pre-filtered)", () => {
    const props = usePropsFromManifest("PreFilteredComponent");
    const names = props.map((p) => p.name);
    expect(names).toEqual(["variant", "size", "defaultValue"]);
  });
});
