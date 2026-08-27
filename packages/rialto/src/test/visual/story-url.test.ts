import { describe, it, expect } from "vitest";
import { buildStoryUrl } from "./story-url";

describe("buildStoryUrl", () => {
  it("targets the requested story via viewMode=story", () => {
    expect(buildStoryUrl("overlay-dialog--default")).toContain(
      "id=overlay-dialog--default&viewMode=story"
    );
  });

  it("sets embed=true so Storybook's own play() autorun never races the harness's interact() helpers", () => {
    // Storybook's preview resolves `shouldAutoplay = !shouldEmbed`, where
    // shouldEmbed checks the `embed` query param — without embed=true,
    // Storybook re-runs each story's own play() function on load, which can
    // race visual.spec.ts's explicit interact() helpers that replicate the
    // same action (open a dialog, show a toast). See #4584.
    expect(buildStoryUrl("overlay-dialog--default")).toContain("embed=true");
  });

  it("builds the exact iframe.html URL", () => {
    expect(buildStoryUrl("overlay-drawer--right")).toBe(
      "/iframe.html?id=overlay-drawer--right&viewMode=story&embed=true"
    );
  });
});
