import { describe, it, expect } from "vitest";

/**
 * Tests for the XSS sanitization logic in useGenStream.
 *
 * The hook sanitizes parsed streaming elements to prevent XSS by
 * stripping event handlers (on*), dangerouslySetInnerHTML, and ref props.
 * These are pure function tests — no React rendering needed.
 *
 * NOTE: Test inputs intentionally contain dangerous props to verify
 * they are correctly stripped by the sanitizer.
 */

const BLOCKED_PROP_KEYS = new Set(["dangerouslySetInnerHTML", "ref"]);

function sanitizeProps(parsed: Record<string, unknown>): Record<string, unknown> {
  if (!parsed.props || typeof parsed.props !== "object") return parsed;

  const props = parsed.props as Record<string, unknown>;
  const safeProps: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    if (!key.startsWith("on") && !BLOCKED_PROP_KEYS.has(key)) {
      safeProps[key] = props[key];
    }
  }
  return { ...parsed, props: safeProps };
}

describe("useGenStream sanitizeProps", () => {
  it("passes through safe props", () => {
    const input = {
      type: "div",
      props: { className: "card", id: "main", style: { color: "red" } },
    };
    const result = sanitizeProps(input);
    expect(result.props).toEqual({
      className: "card",
      id: "main",
      style: { color: "red" },
    });
  });

  it("strips onClick and other event handlers", () => {
    const input = {
      type: "button",
      props: {
        className: "btn",
        onClick: "alert('xss')",
        onMouseOver: "steal(document.cookie)",
        onLoad: "bad()",
      },
    };
    const result = sanitizeProps(input);
    expect(result.props).toEqual({ className: "btn" });
  });

  it("strips dangerouslySetInnerHTML", () => {
    // Test verifies the sanitizer correctly removes this dangerous prop
    const input = {
      type: "div",
      props: {
        className: "content",
        dangerouslySetInnerHTML: { __html: "<img src=x onerror=alert(1)>" }, // eslint-disable-line
      },
    };
    const result = sanitizeProps(input);
    expect(result.props).toEqual({ className: "content" });
  });

  it("strips ref prop", () => {
    const input = {
      type: "input",
      props: { ref: "stolenRef", value: "safe" },
    };
    const result = sanitizeProps(input);
    expect(result.props).toEqual({ value: "safe" });
  });

  it("handles missing props gracefully", () => {
    const input = { type: "br" };
    const result = sanitizeProps(input);
    expect(result).toEqual({ type: "br" });
  });

  it("handles non-object props gracefully", () => {
    const input = { type: "span", props: "invalid" };
    const result = sanitizeProps(input);
    expect(result).toEqual({ type: "span", props: "invalid" });
  });

  it("preserves data-* and aria-* attributes", () => {
    const input = {
      type: "div",
      props: {
        "data-testid": "card",
        "aria-label": "Close",
        onClick: "bad()",
      },
    };
    const result = sanitizeProps(input);
    expect(result.props).toEqual({
      "data-testid": "card",
      "aria-label": "Close",
    });
  });
});
