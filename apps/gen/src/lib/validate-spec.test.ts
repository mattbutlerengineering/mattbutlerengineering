import { describe, it, expect, vi } from "vitest";
import type { Spec } from "@json-render/react";

const mockValidate = vi.fn();
vi.mock("@mbe/rialto-catalog/catalog", () => ({
  catalog: { validate: (spec: unknown) => mockValidate(spec) },
}));

import { validateSpecAgainstCatalog } from "./validate-spec.js";

const SPEC: Spec = { root: "a", elements: { a: { type: "Stack", props: {}, children: [] } } };

describe("validateSpecAgainstCatalog", () => {
  it("returns ok when the catalog accepts the spec", () => {
    mockValidate.mockReturnValue({ success: true, data: SPEC });
    expect(validateSpecAgainstCatalog(SPEC)).toEqual({ ok: true });
    expect(mockValidate).toHaveBeenCalledWith(SPEC);
  });

  it("returns the catalog's error message when the spec is rejected", () => {
    mockValidate.mockReturnValue({ success: false, error: { message: "unknown type Nope" } });
    expect(validateSpecAgainstCatalog(SPEC)).toEqual({ ok: false, message: "unknown type Nope" });
  });

  it("falls back to a generic message when no error is given", () => {
    mockValidate.mockReturnValue({ success: false });
    expect(validateSpecAgainstCatalog(SPEC)).toEqual({
      ok: false,
      message: "Spec does not conform to the Rialto catalog",
    });
  });
});
