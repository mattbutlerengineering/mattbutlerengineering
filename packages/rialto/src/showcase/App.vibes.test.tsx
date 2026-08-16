import { VIBES } from "./App";
import { vibes, type VibeName } from "../providers";

/* `vibes` is typed `Record<VibeName, VibeOverrides>`, so adding a union member
 * is compile-enforced to add the preset — but this list is a separate literal
 * the type system never checks. A vibe can therefore ship and be unreachable
 * from the showcase switcher, which is the only place it can be tried by hand.
 * This test is that missing check. */
describe("showcase vibe switcher", () => {
  it("offers every vibe the design system defines", () => {
    const offered = VIBES.map((v) => v.value).sort();
    const defined = (Object.keys(vibes) as VibeName[]).sort();
    expect(offered).toEqual(defined);
  });

  it("gives every entry a human label", () => {
    for (const entry of VIBES) {
      expect(entry.label.trim().length).toBeGreaterThan(0);
    }
  });
});
