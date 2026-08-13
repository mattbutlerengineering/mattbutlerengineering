import type { Page } from "@playwright/test";
import {
  buildOidcUserEntry,
  fetchAuth0TokensWithRetry,
  validateAuth0Config,
} from "../auth-helpers.js";

/** Every venue this journey creates carries this prefix, so cleanup is exact. */
export const SYNTHETIC_VENUE_PREFIX = "synthetic-journey-";

/** Prod API origin. Same value `deploy-static.yml` bakes in as VITE_API_URL. */
const API_BASE_URL = process.env["JOURNEY_API_URL"] ?? "https://mattbutlerengineering.com";

interface VenueSummary {
  id: string;
  name: string;
}

/**
 * Signs the page in against the LIVE site and returns the access token, which
 * the sweep/cleanup calls reuse so no second ROPC round-trip is needed.
 *
 * Tokens are minted with the ROPC-capable E2E client. The *storage key* uses
 * `JOURNEY_OIDC_CLIENT_ID` when set (the client id the deployed SPA was built
 * with) and falls back to the E2E client id when the two are the same app.
 */
export async function authenticateAgainstLiveSite(page: Page): Promise<string> {
  const config = validateAuth0Config();
  const tokens = await fetchAuth0TokensWithRetry(config);
  const storageClientId = process.env["JOURNEY_OIDC_CLIENT_ID"] || config.clientId;
  const entry = buildOidcUserEntry(config, tokens, storageClientId);

  await page.goto("");
  await page.evaluate(({ key, value }) => {
    localStorage.setItem(key, value);
  }, entry);
  await page.reload();

  return tokens.access_token;
}

async function apiRequest(accessToken: string, path: string, method: string): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
}

/** Lists every venue whose name carries the synthetic-journey prefix. */
export async function listSyntheticVenues(accessToken: string): Promise<VenueSummary[]> {
  const response = await apiRequest(accessToken, "/api/v1/venues?limit=100", "GET");
  if (!response.ok) {
    throw new Error(`Listing venues failed (HTTP ${response.status})`);
  }

  const payload = (await response.json()) as { data?: VenueSummary[] };
  return (payload.data ?? []).filter((venue) => venue.name?.startsWith(SYNTHETIC_VENUE_PREFIX));
}

/** Result of a delete attempt — carries the real status so a refusal is diagnosable (#4152). */
export interface DeleteVenueResult {
  ok: boolean;
  status: number;
}

/**
 * Deletes a venue. `ok` is true when the venue is gone (204) or was already
 * gone (404); false for any other status (e.g. 409 because the venue picked
 * up tables or reservations). `status` is always the real HTTP status, so the
 * caller can report *why* a delete failed rather than just that it did.
 */
export async function deleteVenue(
  accessToken: string,
  venueId: string
): Promise<DeleteVenueResult> {
  const response = await apiRequest(accessToken, `/api/v1/venues/${venueId}`, "DELETE");
  const status = response.status;
  return { ok: status === 204 || status === 404, status };
}

/**
 * Removes leftovers from previously aborted runs. Prod data hygiene: an
 * interrupted journey must never accumulate junk venues. Returns the names
 * (with the HTTP status that blocked each one) it could not delete, so the
 * journey can report them as friction.
 */
export async function sweepSyntheticVenues(accessToken: string): Promise<string[]> {
  const leftovers = await listSyntheticVenues(accessToken);
  const undeleted: string[] = [];

  for (const venue of leftovers) {
    const result = await deleteVenue(accessToken, venue.id);
    if (!result.ok) undeleted.push(`${venue.name} (HTTP ${result.status})`);
  }

  return undeleted;
}
