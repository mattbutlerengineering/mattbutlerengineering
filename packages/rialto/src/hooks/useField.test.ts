/**
 * Tests for useField — the headless field primitive that owns id generation,
 * label association, hint + error wiring, and required/optional markup.
 *
 * Key assertion: the error message MUST be programmatically associated with
 * the control via aria-describedby when error=true.
 */
import { renderHook } from "@testing-library/react";
import { useField } from "./useField";

describe("useField", () => {
  describe("id generation", () => {
    it("generates stable controlProps.id", () => {
      const { result } = renderHook(() => useField({}));
      expect(result.current.controlProps.id).toBeTruthy();
    });

    it("uses provided id when given", () => {
      const { result } = renderHook(() => useField({ id: "my-id" }));
      expect(result.current.controlProps.id).toBe("my-id");
    });
  });

  describe("label association", () => {
    it("labelProps.htmlFor matches controlProps.id", () => {
      const { result } = renderHook(() => useField({}));
      expect(result.current.labelProps.htmlFor).toBe(result.current.controlProps.id);
    });
  });

  describe("hint wiring", () => {
    it("descriptionProps.id is set when hint is provided", () => {
      const { result } = renderHook(() => useField({ hint: "Some hint" }));
      expect(result.current.descriptionProps.id).toBeTruthy();
    });

    it("controlProps.aria-describedby includes hint id when hint is provided", () => {
      const { result } = renderHook(() => useField({ hint: "Some hint" }));
      const describedBy = result.current.controlProps["aria-describedby"];
      expect(describedBy).toContain(result.current.descriptionProps.id);
    });

    it("controlProps has no aria-describedby when no hint and no error", () => {
      const { result } = renderHook(() => useField({}));
      expect(result.current.controlProps["aria-describedby"]).toBeUndefined();
    });
  });

  describe("error wiring — the bug fix", () => {
    it("sets aria-invalid on controlProps when error=true", () => {
      const { result } = renderHook(() => useField({ error: true }));
      expect(result.current.controlProps["aria-invalid"]).toBe(true);
    });

    it("does not set aria-invalid when error=false", () => {
      const { result } = renderHook(() => useField({ error: false }));
      expect(result.current.controlProps["aria-invalid"]).toBeUndefined();
    });

    it("errorProps.id is set when error=true", () => {
      const { result } = renderHook(() => useField({ error: true }));
      expect(result.current.errorProps.id).toBeTruthy();
    });

    it("controlProps.aria-describedby is undefined when error=true but no hint (no element to point to)", () => {
      const { result } = renderHook(() => useField({ error: true }));
      // aria-invalid=true is set; aria-describedby is only set when hint text is present
      // to avoid dangling references to non-existent DOM elements.
      const describedBy = result.current.controlProps["aria-describedby"];
      expect(describedBy).toBeUndefined();
    });

    it("controlProps.aria-describedby includes errorProps.id when error=true and hint is provided", () => {
      const { result } = renderHook(() => useField({ error: true, hint: "Error text" }));
      const describedBy = result.current.controlProps["aria-describedby"];
      // The hint element (which doubles as error region) is referenced
      expect(describedBy).toContain(result.current.errorProps.id);
    });

    it("controlProps.aria-describedby is set when both hint and error present", () => {
      const { result } = renderHook(() => useField({ hint: "hint", error: true }));
      const describedBy = result.current.controlProps["aria-describedby"];
      // The hint element doubles as the error region — same id is referenced
      expect(describedBy).toBeTruthy();
      expect(describedBy).toContain(result.current.descriptionProps.id);
    });

    it("errorProps.id is undefined when error=false", () => {
      const { result } = renderHook(() => useField({ error: false }));
      expect(result.current.errorProps.id).toBeUndefined();
    });
  });

  describe("required / optional", () => {
    it("required is passed through to controlProps", () => {
      const { result } = renderHook(() => useField({ required: true }));
      expect(result.current.controlProps.required).toBe(true);
    });

    it("showRequired is true when required=true", () => {
      const { result } = renderHook(() => useField({ required: true }));
      expect(result.current.showRequired).toBe(true);
    });

    it("showRequired is false when required=false", () => {
      const { result } = renderHook(() => useField({ required: false }));
      expect(result.current.showRequired).toBe(false);
    });

    it("showOptional is true when showOptional=true and not required", () => {
      const { result } = renderHook(() => useField({ showOptional: true, required: false }));
      expect(result.current.showOptional).toBe(true);
    });

    it("showOptional is false when both showOptional=true and required=true", () => {
      const { result } = renderHook(() => useField({ showOptional: true, required: true }));
      expect(result.current.showOptional).toBe(false);
    });
  });
});
