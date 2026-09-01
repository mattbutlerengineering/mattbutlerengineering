import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const MAX_OG_IMAGE_BYTES = 300 * 1024;
const SHARED_GENERIC_IMAGE = "https://mattbutlerengineering.com/og-image.png";

/**
 * Per-app OG-image expectations (#4857): each of the four apps must
 * unfurl with its own dedicated brand card, not the shared generic
 * og-image.png that used to make a "Rialto — Design System" link
 * unfurl as a plain business card.
 */
const OG_IMAGE_APPS = [
  {
    app: "marketing",
    htmlPath: resolve(ROOT, "apps/marketing/index.html"),
    imageUrl: "https://mattbutlerengineering.com/og-marketing.png",
    imagePath: resolve(ROOT, "apps/marketing/public/og-marketing.png"),
  },
  {
    app: "rialto-web",
    htmlPath: resolve(ROOT, "apps/rialto-web/index.html"),
    imageUrl: "https://mattbutlerengineering.com/rialto/og-rialto.png",
    imagePath: resolve(ROOT, "apps/rialto-web/public/og-rialto.png"),
  },
  {
    app: "hospitality",
    htmlPath: resolve(ROOT, "apps/hospitality/index.html"),
    imageUrl: "https://mattbutlerengineering.com/hospitality/og-hospitality.png",
    imagePath: resolve(ROOT, "apps/hospitality/public/og-hospitality.png"),
  },
  {
    app: "gen",
    htmlPath: resolve(ROOT, "apps/gen/index.html"),
    imageUrl: "https://mattbutlerengineering.com/gen/og-gen.png",
    imagePath: resolve(ROOT, "apps/gen/public/og-gen.png"),
  },
];

/**
 * Extracts a meta tag's `content` value regardless of prettier's line
 * wrapping (long `content="…"` values get split across three lines).
 */
function metaContent(html, attrMatch) {
  const re = new RegExp(`<meta\\s+${attrMatch}\\s+content="([^"]+)"\\s*/>`);
  return re.exec(html)?.[1];
}

describe("per-app og:image / twitter:image (#4857)", () => {
  it.each(OG_IMAGE_APPS)(
    "$app points og:image and twitter:image at its own dedicated card, not the shared generic one",
    ({ app, htmlPath, imageUrl }) => {
      const html = readFileSync(htmlPath, "utf8");

      expect(
        html,
        `apps/${app}/index.html should not reference the shared generic og-image.png`
      ).not.toContain(`content="${SHARED_GENERIC_IMAGE}"`);
      expect(metaContent(html, 'property="og:image"')).toBe(imageUrl);
      expect(metaContent(html, 'name="twitter:image"')).toBe(imageUrl);
    }
  );

  it.each(OG_IMAGE_APPS)(
    "$app's dedicated og-image file exists at its served path and is under 300KB",
    ({ app, imagePath }) => {
      expect(existsSync(imagePath), `expected ${imagePath} to exist`).toBe(true);

      const { size } = statSync(imagePath);
      expect(
        size,
        `apps/${app} og-image is ${size} bytes, over the 300KB budget`
      ).toBeLessThanOrEqual(MAX_OG_IMAGE_BYTES);
    }
  );
});

describe("marketing share copy reads in the site's real voice (#4857)", () => {
  const BOILERPLATE = "software engineering solutions for hospitality and beyond";

  it("description, og:description, and twitter:description drop the LinkedIn boilerplate", () => {
    const html = readFileSync(resolve(ROOT, "apps/marketing/index.html"), "utf8");
    expect(html.toLowerCase()).not.toContain(BOILERPLATE);
  });

  it("og:description matches the site's actual hero voice", () => {
    const html = readFileSync(resolve(ROOT, "apps/marketing/index.html"), "utf8");
    expect(html).toContain("This site ships itself");
  });
});
