import type { ManagedVenueAddress } from "@mbe/api-client";

const MAPS_SEARCH_URL = "https://www.google.com/maps/search/";

/**
 * Maps deep link for "Get directions": a search for the venue name plus its postal address when
 * the venue has one, else for the name alone. The query goes through `URLSearchParams`, so every
 * component is percent-encoded and nothing the venue typed can add a parameter or change the host.
 */
export function buildDirectionsUrl(
  venueName: string,
  address: ManagedVenueAddress | undefined
): string {
  const parts = address
    ? [
        venueName,
        address.line1,
        address.line2,
        address.city,
        `${address.region} ${address.postalCode}`,
        address.country,
      ]
    : [venueName];
  const params = new URLSearchParams({
    api: "1",
    query: parts.filter((part): part is string => Boolean(part)).join(", "),
  });
  return `${MAPS_SEARCH_URL}?${params.toString()}`;
}
