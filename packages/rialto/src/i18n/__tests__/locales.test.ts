import { enUS, type RialtoMessages } from "../messages";
import { enGB } from "../locales/en-GB";
import { esMX } from "../locales/es-MX";
import { frCA } from "../locales/fr-CA";

const LOCALES: Record<string, RialtoMessages> = { enGB, esMX, frCA };

describe("Rialto locale modules", () => {
  it.each(Object.entries(LOCALES))("%s defines exactly the en-US keys", (_name, messages) => {
    expect(Object.keys(messages).sort()).toEqual(Object.keys(enUS).sort());
  });

  it("en-GB reuses en-US wording where it is identical", () => {
    expect(enGB).toEqual(enUS);
  });

  it.each([
    ["esMX", esMX],
    ["frCA", frCA],
  ] as const)("%s translates every entry", (_name, messages) => {
    for (const key of Object.keys(enUS) as (keyof RialtoMessages)[]) {
      expect(messages[key]).not.toBe(enUS[key]);
    }
  });
});
