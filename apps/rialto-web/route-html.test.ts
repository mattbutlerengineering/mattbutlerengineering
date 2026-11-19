import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEMOS_TITLE, renderDemosHtml } from "./route-html";

const shell = readFileSync(resolve(__dirname, "index.html"), "utf8");

describe("renderDemosHtml", () => {
  it("serves the demos index its own title, distinct from the design-system home", () => {
    const html = renderDemosHtml(shell);
    expect(DEMOS_TITLE).not.toBe("Rialto — Design System");
    expect(html).toContain(`<title>${DEMOS_TITLE}</title>`);
    expect(html).not.toContain("<title>Rialto — Design System</title>");
  });

  it("keeps the social titles and canonical in step with the title", () => {
    const html = renderDemosHtml(shell);
    expect(html).toContain(`<meta property="og:title" content="${DEMOS_TITLE}" />`);
    expect(html).toContain(`<meta name="twitter:title" content="${DEMOS_TITLE}" />`);
    expect(html).toContain(
      '<link rel="canonical" href="https://mattbutlerengineering.com/rialto/demos/" />'
    );
    expect(html).toContain(
      '<meta property="og:url" content="https://mattbutlerengineering.com/rialto/demos/" />'
    );
  });

  it("throws when the shell lacks an expected tag", () => {
    expect(() => renderDemosHtml("<html></html>")).toThrow(/title/);
  });
});
