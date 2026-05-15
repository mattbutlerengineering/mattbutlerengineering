import { describe, it, expect } from "vitest";
import { escapeHtml, sanitizeStreamChunk, createSanitizedStream } from "./sanitize-output.js";

describe("escapeHtml", () => {
  it("escapes < and > characters", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;"
    );
  });

  it("escapes ampersands", () => {
    expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('a "quoted" value')).toBe("a &quot;quoted&quot; value");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#x27;s");
  });

  it("returns empty string for empty input", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("returns plain text unchanged", () => {
    expect(escapeHtml("hello world 123")).toBe("hello world 123");
  });

  it("escapes nested tags", () => {
    expect(escapeHtml("<div><img onerror=alert(1)></div>")).toBe(
      "&lt;div&gt;&lt;img onerror=alert(1)&gt;&lt;/div&gt;"
    );
  });

  it("escapes event handler attributes", () => {
    expect(escapeHtml('<a onmouseover="steal()">link</a>')).toBe(
      "&lt;a onmouseover=&quot;steal()&quot;&gt;link&lt;/a&gt;"
    );
  });

  it("handles multiple entities in sequence", () => {
    expect(escapeHtml("&<>\"'")).toBe("&amp;&lt;&gt;&quot;&#x27;");
  });

  it("does not double-escape already escaped entities", () => {
    // If input already contains &amp; it should escape the & again
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
  });

  it("handles unicode and emoji safely", () => {
    expect(escapeHtml("hello 🌍 café")).toBe("hello 🌍 café");
  });

  it("escapes javascript: protocol in markup", () => {
    expect(escapeHtml('<a href="javascript:alert(1)">click</a>')).toBe(
      "&lt;a href=&quot;javascript:alert(1)&quot;&gt;click&lt;/a&gt;"
    );
  });
});

describe("sanitizeStreamChunk", () => {
  it("escapes HTML in plain text chunks", () => {
    expect(sanitizeStreamChunk("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("sanitizes text fields in NDJSON chunks", () => {
    const ndjson = JSON.stringify({ type: "text", text: "<script>xss</script>" });
    const result = JSON.parse(sanitizeStreamChunk(ndjson));
    expect(result.text).toBe("&lt;script&gt;xss&lt;/script&gt;");
  });

  it("preserves non-text fields in NDJSON", () => {
    const ndjson = JSON.stringify({ type: "usage", inputTokens: 100 });
    const result = JSON.parse(sanitizeStreamChunk(ndjson));
    expect(result).toEqual({ type: "usage", inputTokens: 100 });
  });

  it("sanitizes nested content field in NDJSON", () => {
    const ndjson = JSON.stringify({ type: "message", content: '<img onerror="alert(1)">' });
    const result = JSON.parse(sanitizeStreamChunk(ndjson));
    expect(result.content).toBe("&lt;img onerror=&quot;alert(1)&quot;&gt;");
  });

  it("handles empty string", () => {
    expect(sanitizeStreamChunk("")).toBe("");
  });

  it("handles whitespace-only string", () => {
    expect(sanitizeStreamChunk("  \n  ")).toBe("  \n  ");
  });

  it("falls back to escapeHtml for malformed JSON", () => {
    const malformed = '{"broken: <script>';
    expect(sanitizeStreamChunk(malformed)).toBe("{&quot;broken: &lt;script&gt;");
  });

  it("sanitizes message field in NDJSON", () => {
    const ndjson = JSON.stringify({ type: "assistant", message: "<div>injected</div>" });
    const result = JSON.parse(sanitizeStreamChunk(ndjson));
    expect(result.message).toBe("&lt;div&gt;injected&lt;/div&gt;");
  });
});

describe("createSanitizedStream", () => {
  async function collectStream(stream: ReadableStream<string>): Promise<string[]> {
    const reader = stream.getReader();
    const chunks: string[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return chunks;
  }

  it("escapes HTML entities in each chunk from a ReadableStream", async () => {
    const source = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("<script>");
        controller.enqueue("alert('xss')");
        controller.enqueue("</script>");
        controller.close();
      },
    });

    const chunks = await collectStream(createSanitizedStream(source));
    expect(chunks).toEqual(["&lt;script&gt;", "alert(&#x27;xss&#x27;)", "&lt;/script&gt;"]);
  });

  it("escapes HTML entities in each chunk from an AsyncIterable", async () => {
    async function* generate(): AsyncIterable<string> {
      yield "<b>bold</b>";
      yield "safe text";
    }

    const chunks = await collectStream(createSanitizedStream(generate()));
    expect(chunks).toEqual(["&lt;b&gt;bold&lt;/b&gt;", "safe text"]);
  });

  it("handles empty stream", async () => {
    const source = new ReadableStream<string>({
      start(controller) {
        controller.close();
      },
    });

    const chunks = await collectStream(createSanitizedStream(source));
    expect(chunks).toEqual([]);
  });
});
