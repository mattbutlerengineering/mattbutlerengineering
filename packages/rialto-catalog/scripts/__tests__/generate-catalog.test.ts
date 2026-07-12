import { describe, it, expect, vi, afterEach } from "vitest";
import { mapTypeToZod } from "../generate-catalog.ts";

/**
 * Branch-matrix coverage for `mapTypeToZod` — the generator's type-string →
 * Zod-expression-source mapper. Exercised directly (issue #3354) so the skip
 * rules that used to silently drop array/function props are pinned by tests
 * rather than only surfacing as a console warning at generation time.
 */
describe("mapTypeToZod", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("skips (returns null)", () => {
    it("skips function types", () => {
      expect(mapTypeToZod("(id: string) => void", false, undefined)).toBeNull();
      expect(mapTypeToZod("() => void", true, undefined)).toBeNull();
    });

    it("skips array types", () => {
      expect(mapTypeToZod("string[]", false, undefined)).toBeNull();
      expect(mapTypeToZod("{ id: string }[]", false, undefined)).toBeNull();
    });

    it("skips Column<> generics and ref/component types", () => {
      expect(mapTypeToZod("Column<unknown>", false, undefined)).toBeNull();
      expect(mapTypeToZod("Ref<HTMLDivElement>", false, undefined)).toBeNull();
      expect(mapTypeToZod("ForwardedRef<HTMLDivElement>", false, undefined)).toBeNull();
      expect(mapTypeToZod("ComponentClass<Props>", false, undefined)).toBeNull();
      expect(mapTypeToZod("FunctionComponent<Props>", false, undefined)).toBeNull();
    });

    it("warns and skips unrecognized types", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(mapTypeToZod("NumberFormatOptions", false, undefined)).toBeNull();
      expect(mapTypeToZod("0 | 1 | 2", false, undefined)).toBeNull();
      expect(warn).toHaveBeenCalled();
    });
  });

  describe("primitives", () => {
    it("maps boolean (and TS-expanded boolean unions)", () => {
      expect(mapTypeToZod("boolean", false, undefined)).toBe("z.boolean()");
      expect(mapTypeToZod("false | true", false, undefined)).toBe("z.boolean()");
      expect(mapTypeToZod("true | false", false, undefined)).toBe("z.boolean()");
    });

    it("maps number", () => {
      expect(mapTypeToZod("number", false, undefined)).toBe("z.number()");
    });

    it("maps plain string", () => {
      expect(mapTypeToZod("string", false, undefined)).toBe("z.string()");
    });
  });

  describe("string character limits", () => {
    it("applies maxLen to string props", () => {
      expect(mapTypeToZod("string", false, 40)).toBe("z.string().max(40)");
    });

    it("applies maxLen to ReactNode props", () => {
      expect(mapTypeToZod("ReactNode", false, 60)).toBe("z.string().max(60)");
    });

    it("ignores maxLen for non-string props", () => {
      expect(mapTypeToZod("number", false, 40)).toBe("z.number()");
      expect(mapTypeToZod("boolean", false, 40)).toBe("z.boolean()");
    });
  });

  describe("ReactNode / JSX → string", () => {
    it("maps ReactNode, JSX.Element, and Element to z.string()", () => {
      expect(mapTypeToZod("ReactNode", false, undefined)).toBe("z.string()");
      expect(mapTypeToZod("JSX.Element", false, undefined)).toBe("z.string()");
      expect(mapTypeToZod("Element", false, undefined)).toBe("z.string()");
    });
  });

  describe("string-literal unions → z.enum", () => {
    it("maps a double-quoted union", () => {
      expect(mapTypeToZod('"sm" | "md" | "lg"', false, undefined)).toBe(
        'z.enum(["sm", "md", "lg"])'
      );
    });

    it("normalizes single-quoted literals to double quotes", () => {
      expect(mapTypeToZod("'left' | 'center' | 'right'", false, undefined)).toBe(
        'z.enum(["left", "center", "right"])'
      );
    });
  });

  describe("optionality", () => {
    it("appends .optional() when isOptional is true", () => {
      expect(mapTypeToZod("boolean", true, undefined)).toBe("z.boolean().optional()");
      expect(mapTypeToZod("string", true, 40)).toBe("z.string().max(40).optional()");
      expect(mapTypeToZod('"a" | "b"', true, undefined)).toBe('z.enum(["a", "b"]).optional()');
    });

    it("treats a trailing `| undefined` as optional (stripUndefined)", () => {
      expect(mapTypeToZod("string | undefined", false, undefined)).toBe("z.string().optional()");
      expect(mapTypeToZod("number | undefined", false, undefined)).toBe("z.number().optional()");
    });

    it("does not double-append when both flags/markers say optional", () => {
      expect(mapTypeToZod("boolean | undefined", true, undefined)).toBe("z.boolean().optional()");
    });
  });
});
