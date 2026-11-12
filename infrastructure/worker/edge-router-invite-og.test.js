/**
 * Tests for the /i/:token link-preview (og:) injection (#8666).
 *
 * Uses a small HTMLRewriter stand-in (the real one is a Workers API) that
 * supports the selectors invite-og.js and the nonce injector use.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

class MockHTMLRewriter {
  constructor() {
    this.handlers = [];
  }

  on(selector, handler) {
    this.handlers.push({ selector, handler });
    return this;
  }

  transform(response) {
    const handlers = this.handlers;
    const body = new ReadableStream({
      async start(controller) {
        let html = await response.text();
        for (const { selector, handler } of handlers) {
          if (selector === "script") {
            handler.element({
              setAttribute: (a, v) => (html = html.replace(/<script/g, `<script ${a}="${v}"`)),
            });
          } else if (selector.startsWith("meta[")) {
            const [, attr, prefix] = /meta\[(\w+)(?:\^?=)"([^"]*)"\]/.exec(selector);
            const exact = selector.includes("]") && !selector.includes("^=");
            const re = new RegExp(`<meta\\s+${attr}="${prefix}${exact ? "" : '[^"]*'}"[^>]*>`, "g");
            html = html.replace(re, () => {
              handler.element({ remove() {} });
              return "";
            });
          } else if (selector === "head") {
            handler.element({
              append: (content) => (html = html.replace("</head>", `${content}</head>`)),
            });
          }
        }
        controller.enqueue(new TextEncoder().encode(html));
        controller.close();
      },
    });
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }
}
globalThis.HTMLRewriter = MockHTMLRewriter;

import edgeRouter from "./edge-router.js";
import { buildCspDirectives } from "./csp.js";

const TOKEN = "fixture-invite-token";
const SPA_HTML =
  '<html><head><title>App</title><meta property="og:title" content="Hospitality">' +
  '<meta property="og:image" content="https://mattbutlerengineering.com/hospitality/og-hospitality.png">' +
  '<meta name="twitter:title" content="Hospitality"></head><body><script src="/a.js"></script></body></html>';

function createHospitalityBinding({ venuePng = true, hangHead = false } = {}) {
  return {
    fetch: vi.fn(async (request) => {
      const { pathname } = new URL(request.url);
      if (pathname.startsWith("/og/venues/")) {
        if (hangHead) {
          // Never settles on its own: only the request's abort signal ends it.
          return new Promise((_resolve, reject) => {
            request.signal.addEventListener("abort", () => reject(new Error("aborted")));
          });
        }
        return venuePng
          ? new Response(null, { status: 200, headers: { "Content-Type": "image/png" } })
          : new Response(SPA_HTML, { status: 200, headers: { "Content-Type": "text/html" } });
      }
      return new Response(SPA_HTML, { status: 200, headers: { "Content-Type": "text/html" } });
    }),
  };
}

function createEnv(binding = createHospitalityBinding()) {
  const other = () => ({ fetch: vi.fn(async () => new Response("<html></html>")) });
  return {
    API_ORIGIN: "https://api.mattbutlerengineering.com",
    MARKETING: other(),
    HOSPITALITY: binding,
    RIALTO: other(),
    GEN: other(),
    HEALTH_STATE: { get: vi.fn(async () => null) },
  };
}

function inviteJson(overrides = {}) {
  return {
    data: {
      venue: { name: "Casa Rosa", slug: "casa-rosa" },
      date: "2026-12-05",
      time: "19:30",
      partySize: 4,
      rsvps: [{ firstName: "Ana", status: "IN" }],
      status: "CONFIRMED",
      ...overrides,
    },
  };
}

const getReq = (host, path) => new Request(`https://${host}${path}`, { method: "GET" });

describe("/i/:token link preview", () => {
  let fetchSpy;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  const mockInvite = (body, status = 200) =>
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    );

  it("injects og:title, og:description and og:image from the public invite view", async () => {
    mockInvite(inviteJson());
    const res = await edgeRouter.fetch(getReq("eat-sheet.com", `/i/${TOKEN}`), createEnv());
    const html = await res.text();
    expect(html).toContain('<meta property="og:title" content="You&#39;re invited to Casa Rosa">');
    expect(html).toContain(
      'property="og:description" content="Join us: 2026-12-05 at 19:30 · party of 4. Tap to RSVP."'
    );
    expect(html).toContain(
      '<meta property="og:image" content="https://eat-sheet.com/og/venues/casa-rosa.png">'
    );
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(fetchSpy.mock.calls[0][0]).toBe(
      `https://api.mattbutlerengineering.com/public/v1/invites/${TOKEN}`
    );
  });

  it("replaces the SPA's own og:/twitter: tags instead of duplicating them", async () => {
    mockInvite(inviteJson());
    const html = await (
      await edgeRouter.fetch(getReq("eat-sheet.com", `/i/${TOKEN}`), createEnv())
    ).text();
    expect(html).not.toContain('content="Hospitality"');
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(html.match(/property="og:image"/g)).toHaveLength(1);
  });

  it("uses a static per-venue PNG and prefixes it on the apex /hospitality path", async () => {
    mockInvite(inviteJson());
    const env = createEnv();
    const res = await edgeRouter.fetch(
      getReq("mattbutlerengineering.com", `/hospitality/i/${TOKEN}`),
      env
    );
    const html = await res.text();
    expect(html).toContain(
      'content="https://mattbutlerengineering.com/hospitality/og/venues/casa-rosa.png"'
    );
    const headReq = env.HOSPITALITY.fetch.mock.calls.find(([r]) => r.method === "HEAD")[0];
    expect(new URL(headReq.url).pathname).toBe("/og/venues/casa-rosa.png");
  });

  it("falls back to the generic preview image when the venue has no PNG", async () => {
    mockInvite(inviteJson());
    const env = createEnv(createHospitalityBinding({ venuePng: false }));
    const html = await (await edgeRouter.fetch(getReq("eat-sheet.com", `/i/${TOKEN}`), env)).text();
    expect(html).toContain('content="https://eat-sheet.com/og-hospitality.png"');
    expect(html).toContain("You&#39;re invited to Casa Rosa");
  });

  it("falls back to the generic image when the asset HEAD is 200 text/html (SPA catch-all)", async () => {
    mockInvite(inviteJson());
    const env = createEnv(createHospitalityBinding({ venuePng: false }));
    const html = await (await edgeRouter.fetch(getReq("eat-sheet.com", `/i/${TOKEN}`), env)).text();
    expect(env.HOSPITALITY.fetch.mock.calls.some(([r]) => r.method === "HEAD")).toBe(true);
    expect(html).toContain(
      'property="og:image" content="https://eat-sheet.com/og-hospitality.png"'
    );
    expect(html).not.toContain("/og/venues/casa-rosa.png");
  });

  it('keeps robots "noindex, nofollow" and replaces the SPA robots tag', async () => {
    mockInvite(inviteJson());
    const spa = SPA_HTML.replace("<title>", '<meta name="robots" content="index"><title>');
    const env = createEnv();
    env.HOSPITALITY.fetch.mockImplementation(
      async () => new Response(spa, { status: 200, headers: { "Content-Type": "text/html" } })
    );
    const html = await (await edgeRouter.fetch(getReq("eat-sheet.com", `/i/${TOKEN}`), env)).text();
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html.match(/name="robots"/g)).toHaveLength(1);
  });

  describe("subrequest timeouts", () => {
    // Deterministic stand-in for AbortSignal.timeout: fires after 10ms.
    let timeoutSpy;
    beforeEach(() => {
      timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
        const controller = new globalThis.AbortController();
        globalThis.setTimeout(() => controller.abort(), 10);
        return controller.signal;
      });
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("aborts a hung invite fetch via its timeout signal and serves generic tags", async () => {
      fetchSpy.mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          })
      );
      const res = await edgeRouter.fetch(getReq("eat-sheet.com", `/i/${TOKEN}`), createEnv());
      const html = await res.text();
      expect(timeoutSpy).toHaveBeenCalledWith(1500);
      expect(html).toContain('property="og:title" content="You&#39;re invited"');
    }, 2000);

    it("aborts a hung venue-image HEAD via its timeout signal and uses the generic image", async () => {
      mockInvite(inviteJson());
      const env = createEnv(createHospitalityBinding({ hangHead: true }));
      const res = await edgeRouter.fetch(getReq("eat-sheet.com", `/i/${TOKEN}`), env);
      const html = await res.text();
      expect(timeoutSpy).toHaveBeenCalledTimes(2);
      expect(html).toContain("You&#39;re invited to Casa Rosa");
      expect(html).toContain(
        'property="og:image" content="https://eat-sheet.com/og-hospitality.png"'
      );
    }, 2000);
  });

  it("escapes venue data for attribute context (quotes and angle brackets)", async () => {
    const name = `Evil" onload="alert(1)"><script>x</script> & Co's`;
    mockInvite(inviteJson({ venue: { name, slug: "casa-rosa" }, date: `"><b>`, time: "<i>" }));
    const html = await (
      await edgeRouter.fetch(getReq("eat-sheet.com", `/i/${TOKEN}`), createEnv())
    ).text();
    expect(html).not.toContain(name);
    expect(html).not.toContain('"><script>x');
    expect(html).not.toContain('"><b>');
    expect(html).toContain(
      "Evil&quot; onload=&quot;alert(1)&quot;&gt;&lt;script&gt;x&lt;/script&gt; &amp; Co&#39;s"
    );
    // The only <script> left is the SPA's own (nonce-stamped).
    expect(html.match(/<script/g)).toHaveLength(1);
  });

  it("does not trust a venue slug that is not a safe path segment", async () => {
    mockInvite(inviteJson({ venue: { name: "X", slug: "../../etc" } }));
    const env = createEnv();
    const html = await (await edgeRouter.fetch(getReq("eat-sheet.com", `/i/${TOKEN}`), env)).text();
    expect(html).toContain('content="https://eat-sheet.com/og-hospitality.png"');
    expect(env.HOSPITALITY.fetch.mock.calls.some(([r]) => r.method === "HEAD")).toBe(false);
  });

  it("never exposes RSVP names or other invite fields in the tags", async () => {
    mockInvite(inviteJson({ booker: { email: "b@x.com" } }));
    const html = await (
      await edgeRouter.fetch(getReq("eat-sheet.com", `/i/${TOKEN}`), createEnv())
    ).text();
    expect(html).not.toContain("Ana");
    expect(html).not.toContain("b@x.com");
  });

  it.each([
    ["network error", () => fetchSpy.mockRejectedValue(new Error("boom"))],
    [
      "timeout",
      () =>
        fetchSpy.mockRejectedValue(Object.assign(new Error("timed out"), { name: "TimeoutError" })),
    ],
    ["404", () => mockInvite({ title: "Not Found" }, 404)],
    ["410", () => mockInvite({ title: "Invitation Ended" }, 410)],
    ["500", () => mockInvite({}, 500)],
    ["malformed JSON", () => fetchSpy.mockResolvedValue(new Response("<html>", { status: 200 }))],
    ["unexpected shape", () => mockInvite({ data: { venue: {} } })],
  ])("falls back to generic tags and still serves the page on %s", async (_label, arrange) => {
    arrange();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await edgeRouter.fetch(getReq("eat-sheet.com", `/i/${TOKEN}`), createEnv());
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('property="og:title" content="You&#39;re invited"');
    expect(html).toContain(
      'property="og:image" content="https://eat-sheet.com/og-hospitality.png"'
    );
    expect(html).toContain("<body>");
  });

  it("leaves other hospitality paths and non-invite hosts untouched", async () => {
    const env = createEnv();
    const other = await (await edgeRouter.fetch(getReq("eat-sheet.com", "/timeline"), env)).text();
    expect(other).toContain('content="Hospitality"');
    const marketing = await edgeRouter.fetch(
      getReq("mattbutlerengineering.com", `/i/${TOKEN}`),
      env
    );
    expect(env.MARKETING.fetch).toHaveBeenCalled();
    expect(await marketing.text()).not.toContain("og:title");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the CSP header and img-src allows an https og:image origin", async () => {
    mockInvite(inviteJson());
    const res = await edgeRouter.fetch(getReq("eat-sheet.com", `/i/${TOKEN}`), createEnv());
    expect(res.headers.get("Content-Security-Policy")).toContain("img-src 'self' data: https:");
    expect(buildCspDirectives("n")).toMatch(/img-src [^;]*https:/);
  });
});
