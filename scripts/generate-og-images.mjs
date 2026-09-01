#!/usr/bin/env node
/**
 * generate-og-images.mjs — one-time generator for per-app OG/social share cards (#4857).
 *
 * Renders one brand HTML template (Bricolage Grotesque + rialto's dark-theme
 * gold-atmosphere gradient, the same recipe as Hero.module.css) at 1200x630
 * for each of the four apps, screenshots it with Playwright, and writes the
 * PNG straight into that app's public/ dir.
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

/** Four brand variants — copy lifted verbatim from #4857 and each app's own hero/description. */
const VARIANTS = [
  {
    eyebrow: "MATT BUTLER ENGINEERING",
    title: "This site ships itself.",
    domain: "mattbutlerengineering.com",
    outPath: resolve(ROOT, "apps/marketing/public/og-marketing.png"),
  },
  {
    eyebrow: "RIALTO — DESIGN SYSTEM",
    title: "Precision-crafted React components.",
    domain: "mattbutlerengineering.com/rialto",
    outPath: resolve(ROOT, "apps/rialto-web/public/og-rialto.png"),
  },
  {
    eyebrow: "HOSPITALITY",
    title: "Restaurant management, simplified.",
    domain: "mattbutlerengineering.com/hospitality",
    outPath: resolve(ROOT, "apps/hospitality/public/og-hospitality.png"),
  },
  {
    eyebrow: "GEN",
    title: "Turn a prompt into a live interface.",
    domain: "mattbutlerengineering.com/gen",
    outPath: resolve(ROOT, "apps/gen/public/og-gen.png"),
  },
];

/** Builds the card HTML for one variant. Colors are rialto's dark-theme tokens, inlined. */
function renderHtml({ eyebrow, title, domain }) {
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
      .stage::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse 70% 60% at 28% 22%, rgb(212 162 58 / 0.16) 0%, transparent 60%),
          radial-gradient(ellipse 45% 45% at 74% 68%, rgb(212 162 58 / 0.12) 0%, transparent 55%),
          radial-gradient(ellipse 120% 70% at 50% 105%, rgb(212 162 58 / 0.08) 0%, transparent 45%);
      }
      .frame {
        position: absolute;
        inset: 48px;
        border: 1px solid rgb(255 255 255 / 0.14);
        border-radius: 12px;
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
        color: #d4a23a;
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
      .divider {
        margin-top: 32px;
        width: 56px;
        height: 3px;
        border-radius: 999px;
        background: #d4a23a;
      }
      .domain {
        position: absolute;
        bottom: 68px;
        font-size: 20px;
        letter-spacing: 0.04em;
        color: rgb(253 252 250 / 0.5);
      }
    </style>
  </head>
  <body>
    <div class="stage">
      <div class="frame"></div>
      <div class="content">
        <div class="eyebrow">${eyebrow}</div>
        <h1 class="title">${title}</h1>
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
