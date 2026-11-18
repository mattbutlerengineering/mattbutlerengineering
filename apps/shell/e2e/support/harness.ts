import { expect, type BrowserContext, type CDPSession, type Page } from "@playwright/test";
import { mockApi } from "../../../hospitality/e2e/api-mocks.js";
import { declareNotRun } from "./not-run.js";
import { resolveSession, resolveTarget, type SessionConfig } from "./target.js";

/**
 * Selectors for what the shell renders. Provisional: the shell does not exist yet (WO-07 to
 * WO-12 build it) and these are the contract those items must meet. One file to change.
 */
export const SEL = {
  nav: "#mbe-host-nav",
  hospitality: "[data-app=hospitality]",
  rialto: "[data-app=rialto]",
  chat: "[data-chat-wrapper]",
  /** The shell's live region, outside every app container. */
  liveRegion: '[aria-live="polite"], [role="status"]',
} as const;

export const TARGET = resolveTarget(process.env);
export const SESSION: SessionConfig | null = resolveSession(process.env);

/** The stand-in token's tail, so the token can be recognised wherever it leaks. */
export const SENTINEL = "STANDIN-NOT-A-REAL-TOKEN";

export const NO_SESSION_REASON =
  "no stand-in session configured: set HARNESS_AUTH_AUTHORITY and HARNESS_AUTH_CLIENT_ID to the " +
  "values the target's hospitality build was built with (real Auth0 sign-in is WO-25)";

export function report(check: string, label: string, value: unknown): void {
  console.info(`RESULT ${check} | ${label} | ${JSON.stringify(value)}`);
}

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

function sessionEntry(session: SessionConfig) {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 8;
  const claims = {
    sub: "auth0|harness",
    email: "standin@example.test",
    name: "Stand In",
    iss: `${session.authority}/`,
    aud: session.clientId,
    iat: exp - 3600,
    exp,
  };
  const token = `${b64({ alg: "none" })}.${b64(claims)}.${SENTINEL}`;
  return {
    key: `oidc.user:${session.authority}:${session.clientId}`,
    value: JSON.stringify({
      access_token: token,
      id_token: token,
      token_type: "Bearer",
      scope: "openid profile email",
      expires_at: exp,
      profile: claims,
    }),
  };
}

export function storageKey(session: SessionConfig): string {
  return sessionEntry(session).key;
}

export type ShellMode = "on" | "off";

/** The kill-switch cookie from the architecture's dark-launch addendum. */
export async function setShellMode(context: BrowserContext, mode: ShellMode): Promise<void> {
  await context.addCookies([{ name: "mbe-shell", value: mode, url: TARGET }]);
}

/** Streams that must stay open are held pending; the tick stub gives chat tokens over time. */
const CHAT_TICK_MS = 250;
const CHAT_TOKENS = 120;

export interface PrepareOptions {
  readonly signedIn?: boolean;
  /** "off" is today's standalone document (the kill switch); default "on" opts into the shell. */
  readonly shell?: ShellMode;
}

/**
 * Wires a page: CSP violation capture, mocked API over the repo's own fixtures, an open SSE
 * stream, a ticking chat stream, and the stand-in session. Signed-in preparation without a
 * configured session declares the test NOT RUN.
 */
export async function prepare(
  page: Page,
  testInfo: Parameters<typeof declareNotRun>[0],
  options: PrepareOptions = {}
): Promise<void> {
  const signedIn = options.signedIn ?? true;
  await setShellMode(page.context(), options.shell ?? "on");
  page.on("pageerror", (e) => console.info(`DIAG pageerror ${e.message.slice(0, 200)}`));
  await page.addInitScript(() => {
    const store: unknown[] = [];
    (window as unknown as { __csp: unknown[] }).__csp = store;
    document.addEventListener("securitypolicyviolation", (e) => {
      store.push({
        directive: e.effectiveDirective,
        blocked: e.blockedURI,
        sample: e.sample,
        source: e.sourceFile,
      });
    });
  });
  if (!signedIn) return;
  if (!SESSION) {
    declareNotRun(testInfo, NO_SESSION_REASON);
    return;
  }
  await mockApi(page);
  const entry = sessionEntry(SESSION);
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), entry);
  await page.addInitScript(
    ({ tickMs, total }) => {
      const realFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url =
          typeof input === "string" ? input : input instanceof Request ? input.url : `${input}`;
        const method = init?.method ?? (input instanceof Request ? input.method : "GET");
        if (!url.endsWith("/gen/agent") || method.toUpperCase() !== "POST") {
          return realFetch(input, init);
        }
        const encoder = new TextEncoder();
        let n = 0;
        let timer = 0;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            timer = window.setInterval(() => {
              n++;
              controller.enqueue(
                encoder.encode(`${JSON.stringify({ type: "text", content: `tok${n} ` })}\n`)
              );
              if (n >= total) {
                window.clearInterval(timer);
                controller.close();
              }
            }, tickMs);
          },
          cancel() {
            window.clearInterval(timer);
            (window as unknown as { __chatAborts: number }).__chatAborts =
              ((window as unknown as { __chatAborts?: number }).__chatAborts ?? 0) + 1;
          },
        });
        return Promise.resolve(
          new Response(body, { headers: { "Content-Type": "application/x-ndjson" } })
        );
      };
    },
    { tickMs: CHAT_TICK_MS, total: CHAT_TOKENS }
  );
  // Registered last, so it wins over mockApi's own stream mock: held open, never fulfilled.
  await page.route("**/events/stream**", () => undefined);
}

export async function violations(page: Page): Promise<ReadonlyArray<Record<string, unknown>>> {
  return page.evaluate(
    () => (window as unknown as { __csp: Array<Record<string, unknown>> }).__csp
  );
}

export function trackDocuments(page: Page) {
  const counts = { documentRequests: 0, urls: [] as string[] };
  page.on("request", (req) => {
    if (req.resourceType() === "document" && req.frame() === page.mainFrame()) {
      counts.documentRequests++;
      counts.urls.push(req.url());
    }
  });
  return counts;
}

/** Open held-pending SSE requests: started minus finished or failed. */
export function trackStreams(page: Page) {
  const state = { opened: 0, closed: 0 };
  const isStream = (url: string) => /\/events\/stream/.test(url);
  page.on("request", (r) => {
    if (isStream(r.url())) state.opened++;
  });
  page.on("requestfinished", (r) => {
    if (isStream(r.url())) state.closed++;
  });
  page.on("requestfailed", (r) => {
    if (isStream(r.url())) state.closed++;
  });
  return { open: () => state.opened - state.closed };
}

/** Programmatic click: the chat drawer's overlay covers the nav for pointer clicks (pre-existing). */
export async function navLink(page: Page, name: string): Promise<void> {
  const link = page.locator(SEL.nav).getByRole("link", { name, exact: true }).first();
  await link.evaluate((a) => (a as HTMLAnchorElement).click());
}

export async function hospitalityReady(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Timeline" }).first()).toBeVisible({
    timeout: 30_000,
  });
  // An open SSE stream means the network never idles: always bounded.
  await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => undefined);
}

export async function rialtoReady(page: Page): Promise<void> {
  await expect(page.locator(SEL.rialto).locator("main").first()).toBeVisible({ timeout: 30_000 });
}

export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
}

/** Sidebar items are buttons, not links. */
export async function openChatAndSend(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Chat", exact: true }).first().click();
  const input = page.locator(`${SEL.chat} textarea`).first();
  await expect(input).toBeVisible();
  await input.fill("conformance message");
  await input.press("Enter");
  await expect(page.locator(SEL.chat).getByText(/tok3 /)).toBeVisible({ timeout: 15_000 });
}

export const chatToken = (page: Page): Promise<number | null> =>
  page.evaluate(() => {
    const last = document.querySelector("[data-chat-wrapper]")?.textContent?.match(/tok(\d+)/g);
    const tail = last?.pop();
    return tail ? Number(tail.slice(3)) : null;
  });

export async function metrics(cdp: CDPSession): Promise<Record<string, number>> {
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
  const { metrics: list } = await cdp.send("Performance.getMetrics");
  const m = Object.fromEntries(list.map((x) => [x.name, x.value]));
  return {
    heapUsedMB: Math.round(((m["JSHeapUsedSize"] ?? 0) / 1048576) * 10) / 10,
    taskSeconds: Math.round((m["TaskDuration"] ?? 0) * 100) / 100,
  };
}

/** Every scrollable descendant's scrollTop, plus the window's. */
export async function scrollSnapshot(
  page: Page,
  selector: string
): Promise<Record<string, number>> {
  return page.evaluate((sel) => {
    const out: Record<string, number> = { window: window.scrollY };
    let i = 0;
    document
      .querySelector(sel)
      ?.querySelectorAll("*")
      .forEach((el) => {
        if (el.scrollTop > 0) out[`${el.tagName}#${i++}`] = el.scrollTop;
      });
    return out;
  }, selector);
}

export async function scrollScrollables(page: Page, selector: string, by: number): Promise<number> {
  return page.evaluate(
    ({ sel, by: amount }) => {
      let n = 0;
      document
        .querySelector(sel)
        ?.querySelectorAll("*")
        .forEach((el) => {
          const cs = getComputedStyle(el);
          if (
            /(auto|scroll)/.test(cs.overflowY) &&
            el.scrollHeight > el.clientHeight + 40 &&
            el.clientHeight > 40
          ) {
            el.scrollTop = amount;
            n++;
          }
        });
      return n;
    },
    { sel: selector, by }
  );
}

const STYLE_PROPS = [
  "color",
  "background-color",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "box-sizing",
  "display",
  "position",
  "overflow-x",
  "overflow-y",
  "border-top-width",
  "border-top-style",
  "border-top-left-radius",
  "text-align",
  "z-index",
  "opacity",
];

export type Fingerprint = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** Computed style of the document root and every element under `rootSelector`. */
export async function fingerprint(page: Page, rootSelector: string): Promise<Fingerprint> {
  return page.evaluate(
    ({ sel, props }) => {
      const out: Record<string, Record<string, string>> = {};
      const read = (el: Element) => {
        const cs = getComputedStyle(el);
        return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]));
      };
      out["html"] = read(document.documentElement);
      out["body"] = read(document.body);
      const root = document.querySelector(sel);
      if (!root) return out;
      const walk = (el: Element, path: string) => {
        const counters = new Map<string, number>();
        for (const child of Array.from(el.children)) {
          const name = child.tagName.toLowerCase();
          if (["script", "style", "link", "svg", "noscript"].includes(name)) continue;
          // A standalone app renders its own site nav; it exists only there, so skip it.
          if (
            child.querySelector(':scope a[href="/rialto"]') &&
            child.querySelector('a[href="/hospitality"]') &&
            (name === "nav" || name === "header")
          )
            continue;
          const nth = (counters.get(name) ?? 0) + 1;
          counters.set(name, nth);
          const key = `${path}>${name}[${nth}]`;
          out[key] = read(child);
          walk(child, key);
        }
      };
      walk(root, "root");
      return out;
    },
    { sel: rootSelector, props: STYLE_PROPS }
  );
}

export function diffFingerprints(base: Fingerprint, other: Fingerprint) {
  const byProp: Record<string, number> = {};
  const samples: string[] = [];
  let compared = 0;
  let differing = 0;
  for (const [key, baseProps] of Object.entries(base)) {
    const otherProps = other[key];
    if (!otherProps) continue;
    compared++;
    let elementDiffers = false;
    for (const [prop, value] of Object.entries(baseProps)) {
      if (value !== otherProps[prop]) {
        elementDiffers = true;
        byProp[prop] = (byProp[prop] ?? 0) + 1;
        if (samples.length < 6) {
          samples.push(`${key.slice(-40)} ${prop}: ${value} -> ${otherProps[prop]}`);
        }
      }
    }
    if (elementDiffers) differing++;
  }
  return { elementsCompared: compared, elementsDiffering: differing, byProp, samples };
}
