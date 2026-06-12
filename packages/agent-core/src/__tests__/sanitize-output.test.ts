/**
 * Characterization tests for `sanitize-output.ts`.
 *
 * NOTE ON ISSUE #2106 PREMISE MISMATCH
 * ------------------------------------
 * Issue #2106 asked for tests pinning a "secret redaction" contract — GitHub
 * PATs, Anthropic API keys, Bearer tokens, generic key=value secrets, etc.
 *
 * The actual implementation does NOT redact secrets. `sanitize-output.ts`
 * performs HTML-entity escaping for XSS prevention (OWASP LLM02). There is no
 * redaction logic, no `[REDACTED]` placeholder, and no credential pattern
 * matching anywhere in the module.
 *
 * Per the characterization mandate, these tests pin the CURRENT behavior
 * exactly rather than inventing a redaction feature that does not exist. The
 * "secret passes through" cases below are deliberate: they characterize the
 * fact that credential-shaped strings are NOT redacted (only their HTML-active
 * characters are escaped). All credential strings used here are fake but
 * real-shaped — no real secret value is committed.
 *
 * The colocated `src/sanitize-output.test.ts` covers the same module from the
 * XSS angle; this file adds the boundary / multiplicity / multiline edge cases
 * and the secret-passthrough characterization requested by the issue.
 */
import { describe, it, expect } from "vitest";
import { escapeHtml, sanitizeStreamChunk, createSanitizedStream } from "../sanitize-output.js";

describe("escapeHtml — exact escaping contract", () => {
  it("escapes the five HTML-active characters to their exact entities", () => {
    expect(escapeHtml("&")).toBe("&amp;");
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml(">")).toBe("&gt;");
    expect(escapeHtml('"')).toBe("&quot;");
    expect(escapeHtml("'")).toBe("&#x27;");
  });

  it("escapes ampersand FIRST so existing entities double-escape (order is load-bearing)", () => {
    // & is replaced before <,>,",' — so a pre-existing entity becomes &amp;...
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
    expect(escapeHtml("a < b && c > d")).toBe("a &lt; b &amp;&amp; c &gt; d");
  });

  it("returns plain (non-active) text completely unmodified", () => {
    expect(escapeHtml("hello world 123 _-.")).toBe("hello world 123 _-.");
  });

  it("returns empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });
});

describe("escapeHtml — edge cases (boundaries, multiplicity, multiline)", () => {
  it("escapes an active character at the start boundary", () => {
    expect(escapeHtml("<leading")).toBe("&lt;leading");
  });

  it("escapes an active character at the end boundary", () => {
    expect(escapeHtml("trailing>")).toBe("trailing&gt;");
  });

  it("escapes active characters at BOTH boundaries", () => {
    expect(escapeHtml("<wrapped>")).toBe("&lt;wrapped&gt;");
  });

  it("escapes multiple occurrences of the same character", () => {
    expect(escapeHtml("<<<")).toBe("&lt;&lt;&lt;");
  });

  it("escapes every active character across a multiline string, preserving newlines", () => {
    const input = 'line1 <a>\nline2 "b" & c\nline3 it\'s';
    expect(escapeHtml(input)).toBe("line1 &lt;a&gt;\nline2 &quot;b&quot; &amp; c\nline3 it&#x27;s");
  });

  it("preserves tabs and carriage returns (only the five chars are touched)", () => {
    expect(escapeHtml("a\t<b>\r\nc")).toBe("a\t&lt;b&gt;\r\nc");
  });
});

describe("escapeHtml — credential-shaped strings are NOT redacted (characterizes absence of redaction)", () => {
  // Fake, real-shaped credentials. None of these are valid secrets.
  it("passes a GitHub PAT through unchanged (no redaction)", () => {
    const fakePat = "ghp_0123456789ABCDEFabcdef0123456789ABCD";
    expect(escapeHtml(fakePat)).toBe(fakePat);
  });

  it("passes an Anthropic-style API key through unchanged (no redaction)", () => {
    const fakeKey = "sk-ant-api03-AAAA1111bbbb2222CCCC3333dddd4444";
    expect(escapeHtml(fakeKey)).toBe(fakeKey);
  });

  it("passes a Bearer authorization header through unchanged (no redaction)", () => {
    const fakeHeader = "Authorization: Bearer abcDEF123456ghiJKL789";
    expect(escapeHtml(fakeHeader)).toBe(fakeHeader);
  });

  it("passes a generic key=value secret through unchanged (no redaction)", () => {
    const fakeKv = "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMIfakeEXAMPLEKEY";
    expect(escapeHtml(fakeKv)).toBe(fakeKv);
  });

  it("only escapes HTML chars adjacent to a secret, leaving the secret value intact", () => {
    const input = "<token>ghp_0123456789ABCDEFabcdef0123456789ABCD</token>";
    expect(escapeHtml(input)).toBe(
      "&lt;token&gt;ghp_0123456789ABCDEFabcdef0123456789ABCD&lt;/token&gt;"
    );
  });
});

describe("sanitizeStreamChunk — plain-text path", () => {
  it("escapes HTML in a plain (non-JSON) chunk", () => {
    expect(sanitizeStreamChunk("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("returns empty string unchanged", () => {
    expect(sanitizeStreamChunk("")).toBe("");
  });

  it("returns a whitespace-only chunk unchanged", () => {
    expect(sanitizeStreamChunk("  \n  ")).toBe("  \n  ");
  });

  it("does not redact a credential in a plain-text chunk (no JSON brace)", () => {
    const fake = "leaked sk-ant-api03-FAKE1234567890abcdefGHIJ token";
    expect(sanitizeStreamChunk(fake)).toBe(fake);
  });

  it("escapes a multiline plain-text chunk that does not start with '{'", () => {
    const input = "first <x>\nsecond & third";
    expect(sanitizeStreamChunk(input)).toBe("first &lt;x&gt;\nsecond &amp; third");
  });
});

describe("sanitizeStreamChunk — NDJSON path", () => {
  it("escapes the `text` field and re-serializes", () => {
    const ndjson = JSON.stringify({ type: "text", text: "<script>xss</script>" });
    expect(sanitizeStreamChunk(ndjson)).toBe(
      JSON.stringify({ type: "text", text: "&lt;script&gt;xss&lt;/script&gt;" })
    );
  });

  it("escapes the `content` field and re-serializes", () => {
    const ndjson = JSON.stringify({ type: "message", content: '<img onerror="x()">' });
    expect(sanitizeStreamChunk(ndjson)).toBe(
      JSON.stringify({ type: "message", content: "&lt;img onerror=&quot;x()&quot;&gt;" })
    );
  });

  it("escapes the `message` field and re-serializes", () => {
    const ndjson = JSON.stringify({ type: "assistant", message: "<div>injected</div>" });
    expect(sanitizeStreamChunk(ndjson)).toBe(
      JSON.stringify({ type: "assistant", message: "&lt;div&gt;injected&lt;/div&gt;" })
    );
  });

  it("returns the ORIGINAL chunk verbatim when no text field needed escaping", () => {
    // changed === false branch: original string returned, not a re-serialization.
    const ndjson = JSON.stringify({ type: "usage", inputTokens: 100 });
    expect(sanitizeStreamChunk(ndjson)).toBe(ndjson);
  });

  it("returns the original chunk when a text field exists but has no active chars", () => {
    const ndjson = JSON.stringify({ type: "text", text: "plain content" });
    expect(sanitizeStreamChunk(ndjson)).toBe(ndjson);
  });

  it("leaves non-text fields untouched while escaping text fields", () => {
    const ndjson = JSON.stringify({ type: "text", text: "<a>", id: "x<y>" });
    const result = JSON.parse(sanitizeStreamChunk(ndjson));
    // text field escaped...
    expect(result.text).toBe("&lt;a&gt;");
    // ...but the non-allowlisted `id` field is left raw.
    expect(result.id).toBe("x<y>");
  });

  it("does NOT redact a credential carried in a JSON text field (only HTML-escapes)", () => {
    const fake = "ghp_0123456789ABCDEFabcdef0123456789ABCD";
    const ndjson = JSON.stringify({ type: "text", text: `key=${fake}` });
    // No active chars in the value → original chunk returned unchanged, secret intact.
    expect(sanitizeStreamChunk(ndjson)).toBe(ndjson);
    expect(JSON.parse(sanitizeStreamChunk(ndjson)).text).toBe(`key=${fake}`);
  });

  it("falls back to full HTML escaping for malformed JSON", () => {
    const malformed = '{"broken: <script>';
    expect(sanitizeStreamChunk(malformed)).toBe("{&quot;broken: &lt;script&gt;");
  });

  it("escapes multiple text fields containing active chars in one object", () => {
    const ndjson = JSON.stringify({
      type: "text",
      text: "<one>",
      content: "<two>",
      message: "<three>",
    });
    expect(sanitizeStreamChunk(ndjson)).toBe(
      JSON.stringify({
        type: "text",
        text: "&lt;one&gt;",
        content: "&lt;two&gt;",
        message: "&lt;three&gt;",
      })
    );
  });
});

describe("createSanitizedStream — per-chunk escaping", () => {
  async function collect(stream: ReadableStream<string>): Promise<string[]> {
    const reader = stream.getReader();
    const chunks: string[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return chunks;
  }

  it("HTML-escapes each chunk from a ReadableStream", async () => {
    const source = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("<script>");
        controller.enqueue("alert('xss')");
        controller.enqueue("</script>");
        controller.close();
      },
    });
    expect(await collect(createSanitizedStream(source))).toEqual([
      "&lt;script&gt;",
      "alert(&#x27;xss&#x27;)",
      "&lt;/script&gt;",
    ]);
  });

  it("HTML-escapes each chunk from an AsyncIterable", async () => {
    async function* gen(): AsyncIterable<string> {
      yield "<b>bold</b>";
      yield "safe text";
    }
    expect(await collect(createSanitizedStream(gen()))).toEqual([
      "&lt;b&gt;bold&lt;/b&gt;",
      "safe text",
    ]);
  });

  it("does NOT redact a credential streamed chunk (passes through, HTML-escaped only)", async () => {
    const fake = "sk-ant-api03-FAKE1234567890abcdefGHIJ";
    async function* gen(): AsyncIterable<string> {
      yield fake;
    }
    // No HTML-active chars → chunk emitted verbatim, secret NOT redacted.
    expect(await collect(createSanitizedStream(gen()))).toEqual([fake]);
  });

  it("handles an empty stream", async () => {
    const source = new ReadableStream<string>({
      start(controller) {
        controller.close();
      },
    });
    expect(await collect(createSanitizedStream(source))).toEqual([]);
  });
});
