import { describe, it, expect } from "vitest";
import { escapeHtml, sanitizeUrl } from "./sanitize.js";

describe("escapeHtml", () => {
  it("escapes angle brackets and quotes to prevent script injection", () => {
    expect(escapeHtml(`<script>alert("xss")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
    );
  });

  it("escapes ampersands and apostrophes", () => {
    expect(escapeHtml(`O'Brien's & Co`)).toBe("O&#39;Brien&#39;s &amp; Co");
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("The Oak Table")).toBe("The Oak Table");
  });
});

describe("sanitizeUrl", () => {
  it("returns the url when scheme is https", () => {
    expect(sanitizeUrl("https://example.com/path")).toBe("https://example.com/path");
  });

  it("returns the url when scheme is http", () => {
    expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
  });

  it("rejects javascript: scheme", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects data: scheme", () => {
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects malformed urls", () => {
    expect(sanitizeUrl("not a url")).toBeNull();
  });
});
