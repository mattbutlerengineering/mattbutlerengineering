#!/usr/bin/env node
/**
 * generate-og-images.mjs — one-time generator for per-app OG/social share cards (#4857).
 *
 * Renders one brand HTML template at 1200x630 for each of the four apps,
 * screenshots it with Playwright, and writes the PNG straight into that
 * app's public/ dir. The template is a direct port of
 * packages/rialto/src/components/Hero/Hero.module.css's dark-theme look:
 * the same 4-orb atmosphere gradient (hues/alphas copied verbatim), the
 * same neutral-tertiary eyebrow color, the same bottom "machined edge"
 * gradient-fade line, and the same italic-gold `.accent` word treatment
 * used by the real Hero usages in apps/rialto-web (OverviewPage.tsx,
 * "components") and apps/gen (LoginLanding.tsx, "prompt").
 *
 * Deliberately NOT wired into CI or `pnpm regen`: per the repo's own visual-
 * baseline gotcha (see .claude/rules/gotchas.md § CI, "Rialto-web visual
 * baselines are Linux CI runner-specific"), cross-platform screenshot
 * rendering is non-deterministic. These four PNGs are generated once here,
 * committed as static assets, and never regenerated automatically.
 *
 * Usage: node scripts/generate-og-images.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const WIDTH = 1200;
const HEIGHT = 630;

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600&family=DM+Sans:wght@500&display=swap";

/**
 * Four brand variants. `titleHtml` wraps one word per tagline in
 * `<span class="accent">`, matching the real per-app Hero usages where
 * they exist (rialto: "components" in OverviewPage.tsx; gen: "prompt" in
 * LoginLanding.tsx) and the same convention elsewhere otherwise.
 */
const VARIANTS = [
  {
    eyebrow: "MATT BUTLER ENGINEERING",
    titleHtml: 'This site ships <span class="accent">itself</span>.',
    domain: "mattbutlerengineering.com",
    outPath: resolve(ROOT, "apps/marketing/public/og-marketing.png"),
  },
  {
    eyebrow: "RIALTO — DESIGN SYSTEM",
    titleHtml: 'Precision-crafted React <span class="accent">components</span>',
    domain: "mattbutlerengineering.com/rialto",
    outPath: resolve(ROOT, "apps/rialto-web/public/og-rialto.png"),
  },
  {
    eyebrow: "HOSPITALITY",
    titleHtml: 'Restaurant management, <span class="accent">simplified</span>.',
    domain: "mattbutlerengineering.com/hospitality",
    outPath: resolve(ROOT, "apps/hospitality/public/og-hospitality.png"),
  },
  {
    eyebrow: "GEN",
    titleHtml: 'Turn a <span class="accent">prompt</span> into a live interface',
    domain: "mattbutlerengineering.com/gen",
    outPath: resolve(ROOT, "apps/gen/public/og-gen.png"),
  },
];

/** Builds the card HTML for one variant. Colors are rialto's dark-theme tokens, inlined. */
function renderHtml({ eyebrow, titleHtml, domain }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <link href="${FONT_HREF}" rel="stylesheet" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        background: #1e1c1a;
        font-family: "DM Sans", system-ui, sans-serif;
      }
      .stage {
        position: relative;
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      /* Atmosphere: Hero.module.css's dark-theme 4-orb gradient mesh,
         hues and alpha values (0.1/0.07/0.05/0.03 ceiling) copied verbatim
         from Hero.module.css:26-59 rather than re-derived. */
      .stage::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
          radial-gradient(ellipse 80% 60% at 30% 25%, rgb(196 146 42 / 0.1) 0%, transparent 60%),
          radial-gradient(ellipse 50% 45% at 70% 65%, rgb(180 120 40 / 0.07) 0%, transparent 55%),
          radial-gradient(ellipse 35% 35% at 50% 45%, rgb(212 162 58 / 0.05) 0%, transparent 50%),
          radial-gradient(ellipse 120% 80% at 50% 100%, rgb(196 146 42 / 0.03) 0%, transparent 40%);
      }
      /* Machined edge: Hero.module.css's .hero::after gradient-fade line
         (Hero.module.css:62-77), border/border-strong dark-theme values
         inlined as rgb(255 255 255 / 0.4) and rgb(255 255 255 / 0.6). */
      .stage::after {
        content: "";
        position: absolute;
        inset-inline: 10%;
        bottom: 0;
        height: 1px;
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgb(255 255 255 / 0.4) 20%,
          rgb(255 255 255 / 0.6) 50%,
          rgb(255 255 255 / 0.4) 80%,
          transparent 100%
        );
      }
      .content {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        max-width: 920px;
        padding: 0 64px;
      }
      .eyebrow {
        font-size: 20px;
        font-weight: 500;
        letter-spacing: 0.2em;
        /* --rialto-text-tertiary (dark theme) — never decorative gold. */
        color: rgb(253 252 250 / 0.5);
      }
      .title {
        margin-top: 28px;
        font-family: "Bricolage Grotesque", "DM Sans", system-ui, sans-serif;
        font-size: 64px;
        font-weight: 600;
        letter-spacing: -0.01em;
        line-height: 1.15;
        color: rgb(253 252 250 / 0.92);
      }
      /* .title .accent — Hero.module.css:109-111's signature italic-gold
         accent-word treatment, e.g. OverviewPage.tsx's "components" and
         LoginLanding.tsx's "prompt". */
      .title .accent {
        color: #d4a23a;
        font-style: italic;
      }
      .divider {
        margin-top: 32px;
        width: 56px;
        height: 3px;
        border-radius: 999px;
        background: #d4a23a;
      }
      .domain {
        position: absolute;
        bottom: 40px;
        font-size: 20px;
        letter-spacing: 0.04em;
        color: rgb(253 252 250 / 0.5);
      }
    </style>
  </head>
  <body>
    <div class="stage">
      <div class="content">
        <div class="eyebrow">${eyebrow}</div>
        <h1 class="title">${titleHtml}</h1>
        <div class="divider"></div>
      </div>
      <div class="domain">${domain}</div>
    </div>
  </body>
</html>`;
}

async function renderVariant(page, variant) {
  await page.setContent(renderHtml(variant), { waitUntil: "networkidle" });
  // eslint-disable-next-line no-undef -- runs in the page's browser context, not Node
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(dirname(variant.outPath), { recursive: true });
  await page.screenshot({ path: variant.outPath, type: "png" });
  const { size } = statSync(variant.outPath);
  console.log(`${variant.outPath.replace(`${ROOT}/`, "")} — ${(size / 1024).toFixed(1)}KB`);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  for (const variant of VARIANTS) {
    await renderVariant(page, variant);
  }
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
