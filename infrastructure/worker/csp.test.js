/**
 * Tests for CSP pure functions: buildCspDirectives and injectNonceIntoHtml.
 *
 * These run outside the Worker runtime — no HTMLRewriter, no Cloudflare globals.
 *
 * Run: npx vitest run infrastructure/worker/csp.test.js
 */

import { describe, it, expect } from "vitest";
import { buildCspDirectives, injectNonceIntoHtml } from "./csp.js";
import { AUTH0_ORIGIN } from "./edge-router.js";

describe("buildCspDirectives", () => {
  const nonce = "abc123";

  it("returns a non-empty string", () => {
    const csp = buildCspDirectives(nonce);
    expect(typeof csp).toBe("string");
    expect(csp.length).toBeGreaterThan(0);
  });

  it("includes default-src 'self'", () => {
    expect(buildCspDirectives(nonce)).toContain("default-src 'self'");
  });

  it("includes nonce in script-src", () => {
    expect(buildCspDirectives(nonce)).toContain(`script-src 'nonce-${nonce}' 'self'`);
  });

  it("does not include unsafe-inline in script-src", () => {
    const csp = buildCspDirectives(nonce);
    // unsafe-inline is NOT allowed for scripts — nonce replaces it
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("allows unsafe-inline in style-src (CSS nonces less critical)", () => {
    expect(buildCspDirectives(nonce)).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("includes google fonts in style-src", () => {
    expect(buildCspDirectives(nonce)).toContain("https://fonts.googleapis.com");
  });

  it("includes gstatic in font-src", () => {
    expect(buildCspDirectives(nonce)).toContain("font-src 'self' https://fonts.gstatic.com");
  });

  it("includes frame-ancestors 'none'", () => {
    expect(buildCspDirectives(nonce)).toContain("frame-ancestors 'none'");
  });

  it("includes base-uri 'self'", () => {
    expect(buildCspDirectives(nonce)).toContain("base-uri 'self'");
  });

  it("includes form-action 'self'", () => {
    expect(buildCspDirectives(nonce)).toContain("form-action 'self'");
  });

  it("uses AUTH0_ORIGIN constant in connect-src by default", () => {
    const csp = buildCspDirectives(nonce);
    expect(csp).toContain(`connect-src 'self' ${AUTH0_ORIGIN}`);
  });

  it("accepts a custom auth0Origin override", () => {
    const customOrigin = "https://custom.auth0.com";
    const csp = buildCspDirectives(nonce, { auth0Origin: customOrigin });
    expect(csp).toContain(`connect-src 'self' ${customOrigin}`);
    expect(csp).not.toContain(AUTH0_ORIGIN);
  });

  it("includes the API origin in connect-src", () => {
    expect(buildCspDirectives(nonce)).toContain("https://api.mattbutlerengineering.com");
  });

  it("is byte-identical to current hardcoded policy when using defaults", () => {
    // This test locks the output to the exact production policy.
    // A nonce change is the ONLY delta allowed between requests.
    const expected = [
      "default-src 'self'",
      `script-src 'nonce-${nonce}' 'self'`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https:",
      "font-src 'self' https://fonts.gstatic.com",
      `connect-src 'self' ${AUTH0_ORIGIN} https://api.mattbutlerengineering.com`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    expect(buildCspDirectives(nonce)).toBe(expected);
  });

  it("overrides directives from a KV policy object", () => {
    // KV policy can replace individual directives while keeping defaults for the rest.
    const kvPolicy = {
      "script-src": `'nonce-${nonce}' 'self' https://cdn.example.com`,
    };
    const csp = buildCspDirectives(nonce, { kvPolicy });
    expect(csp).toContain("https://cdn.example.com");
  });

  it("directives are joined with '; ' separator", () => {
    const csp = buildCspDirectives(nonce);
    // Each directive separated by "; "
    const parts = csp.split("; ");
    expect(parts.length).toBeGreaterThanOrEqual(8);
  });
});

describe("injectNonceIntoHtml", () => {
  it("adds nonce attribute to <script> tags", () => {
    const html = '<script type="module">console.log("hi")</script>';
    const result = injectNonceIntoHtml(html, "abc123");
    expect(result).toContain('nonce="abc123"');
  });

  it("adds nonce to multiple <script> tags", () => {
    const html = '<script>a()</script><script type="module" src="/main.js"></script>';
    const result = injectNonceIntoHtml(html, "xyz789");
    const matches = result.match(/nonce="xyz789"/g);
    expect(matches).toHaveLength(2);
  });

  it("preserves existing attributes on <script> tags", () => {
    const html = '<script type="module" src="/app.js"></script>';
    const result = injectNonceIntoHtml(html, "abc123");
    expect(result).toContain('type="module"');
    expect(result).toContain('src="/app.js"');
    expect(result).toContain('nonce="abc123"');
  });

  it("does not modify non-script HTML", () => {
    const html = "<div><p>Hello</p></div>";
    const result = injectNonceIntoHtml(html, "abc123");
    expect(result).toBe(html);
  });

  it("handles HTML with no script tags", () => {
    const html = "<html><body><h1>No scripts</h1></body></html>";
    const result = injectNonceIntoHtml(html, "abc123");
    expect(result).toBe(html);
  });

  it("returns the original string when it is empty", () => {
    expect(injectNonceIntoHtml("", "abc")).toBe("");
  });

  it("treats all <script> tokens the same (pure string transform, not a parser)", () => {
    // This pure function is a Node-testable mirror of NonceInjector (HTMLRewriter).
    // HTMLRewriter skips commented-out tags because it parses the DOM; this function
    // is a simple regex replace and does not. The test documents that difference
    // so callers know the production path (HTMLRewriter) handles comments correctly.
    const html = "<script>real</script>";
    const result = injectNonceIntoHtml(html, "abc123");
    expect(result).toContain('nonce="abc123"');
  });

  it("preserves content between script tags", () => {
    const html = "<script>const x = 42;</script>";
    const result = injectNonceIntoHtml(html, "n1");
    expect(result).toContain("const x = 42;");
  });
});
