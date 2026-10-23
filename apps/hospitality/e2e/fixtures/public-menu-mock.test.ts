import { describe, it, expect } from "vitest";
import { PublicMenuDetailSchema } from "@mbe/types/schemas";
import { buildPublicMenuFixture } from "../api-mocks.js";

// #7331: the stateful menus mock starts empty, so the ui-quality capture of the guest
// menu route (/menu/:venueSlug/dinner) hit a 404 and filed a false failed-request.
describe("guest menu capture fixture", () => {
  it("matches the PublicMenuDetail contract under the slug the capture visits", () => {
    const fixture = buildPublicMenuFixture();

    expect(PublicMenuDetailSchema.parse(fixture).slug).toBe("dinner");
    expect(fixture.sections.length).toBeGreaterThan(0);
  });
});
