/**
 * The ten location and timezone phrasings of the #9381 kill test. `expected` is
 * the patch a correct model proposes for the locationTime step. The live-model
 * run is recorded in docs/features/chat-first-hospitality/kill-test.md.
 */
export const KILL_TEST_PHRASINGS: ReadonlyArray<{
  readonly phrasing: string;
  readonly expected: { readonly ianaTimezone: string; readonly currencyCode?: string };
}> = [
  { phrasing: "We're in Lisbon", expected: { ianaTimezone: "Europe/Lisbon", currencyCode: "EUR" } },
  {
    phrasing: "Pacific time, Seattle",
    expected: { ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  },
  {
    phrasing: "Our restaurant is in Toronto",
    expected: { ianaTimezone: "America/Toronto", currencyCode: "CAD" },
  },
  {
    phrasing: "Mexico City, we bill in pesos",
    expected: { ianaTimezone: "America/Mexico_City", currencyCode: "MXN" },
  },
  {
    phrasing: "London, UK",
    expected: { ianaTimezone: "Europe/London", currencyCode: "GBP" },
  },
  {
    phrasing: "Central time please",
    expected: { ianaTimezone: "America/Chicago", currencyCode: "USD" },
  },
  {
    phrasing: "Sydney, Australia",
    expected: { ianaTimezone: "Australia/Sydney", currencyCode: "AUD" },
  },
  {
    phrasing: "Montreal, prices in Canadian dollars",
    expected: { ianaTimezone: "America/Toronto", currencyCode: "CAD" },
  },
  {
    phrasing: "We are in Paris",
    expected: { ianaTimezone: "Europe/Paris", currencyCode: "EUR" },
  },
  {
    phrasing: "Honolulu, Hawaii",
    expected: { ianaTimezone: "Pacific/Honolulu", currencyCode: "USD" },
  },
];
