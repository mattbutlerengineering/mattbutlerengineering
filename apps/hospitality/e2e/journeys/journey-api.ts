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

/**
 * Whether the non-admin journey identity's credentials are provisioned.
 * `resolveNonAdminAuthEnv` throws once they're read, which is right for a
 * step already committed to running — this lets the caller check first and
 * skip the step instead (see #4527: unprovisioned repos should not hard-fail
 * the whole journey over one never-created Auth0 test account).
 */
export function isNonAdminAuthConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return Boolean(env["E2E_NONADMIN_AUTH_EMAIL"]) && Boolean(env["E2E_NONADMIN_AUTH_PASSWORD"]);
}

/**
 * Builds the env the NON-ADMIN journey identity authenticates with: the same
 * tenant, client and audience as the admin identity, but different
 * credentials.
 *
 * Throws when either non-admin variable is missing rather than falling back to
 * `E2E_AUTH_EMAIL`/`E2E_AUTH_PASSWORD`. A fallback would run the bootstrap case
 * as a platform admin, which takes `requireVenueCreateAccess`'s skip-the-lookup
 * branch — the journey would stay green while exercising none of the behaviour
 * it exists to prove.
 */
export function resolveNonAdminAuthEnv(
  env: Record<string, string | undefined> = process.env
): Record<string, string | undefined> {
  const email = env["E2E_NONADMIN_AUTH_EMAIL"];
  const password = env["E2E_NONADMIN_AUTH_PASSWORD"];

  const missing: string[] = [];
  if (!email) missing.push("E2E_NONADMIN_AUTH_EMAIL");
  if (!password) missing.push("E2E_NONADMIN_AUTH_PASSWORD");

  if (missing.length > 0) {
    throw new Error(
      `Missing required non-admin journey env vars: ${missing.join(", ")}\n\n` +
        "  E2E_NONADMIN_AUTH_EMAIL     — an Auth0 user WITHOUT the admin role\n" +
        "  E2E_NONADMIN_AUTH_PASSWORD  — that user's password\n\n" +
        "They are deliberately not defaulted to the admin credentials: the " +
        "first-venue bootstrap case only exists for non-admins, so an admin " +
        "fallback would make this journey pass without exercising it."
    );
  }

  return { ...env, E2E_AUTH_EMAIL: email, E2E_AUTH_PASSWORD: password };
}

/**
 * Reads the `permissions` claim out of an access token.
 *
 * No signature verification: this is used to assert a property of the test's
 * OWN identity, never to make an authorization decision. A malformed token
 * throws rather than reporting an empty list, because "no permissions" and
 * "never parsed" would otherwise be indistinguishable — and the first reads as
 * "not an admin", which is exactly the assertion being made.
 */
export function readTokenPermissions(accessToken: string): string[] {
  const segments = accessToken.split(".");
  if (segments.length !== 3 || !segments[1]) {
    throw new Error(
      "Access token is not a well-formed JWT (expected three dot-separated segments)"
    );
  }

  const claims: unknown = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
  if (typeof claims !== "object" || claims === null) {
    throw new Error("Access token payload did not decode to an object");
  }

  const permissions = (claims as { permissions?: unknown }).permissions;
  if (permissions === undefined) return [];
  if (!Array.isArray(permissions)) {
    throw new Error("Access token `permissions` claim is present but not an array");
  }
  return permissions.map(String);
}

/**
 * Mints an access token for the non-admin identity. No `Page` involved — this
 * journey case drives the API directly, because the bootstrap path has no UI
 * of its own yet (the onboarding wizard is reached only once a venue exists).
 */
export async function authenticateNonAdmin(): Promise<{
  accessToken: string;
  permissions: string[];
}> {
  const config = validateAuth0Config(resolveNonAdminAuthEnv());
  const tokens = await fetchAuth0TokensWithRetry(config);
  return {
    accessToken: tokens.access_token,
    permissions: readTokenPermissions(tokens.access_token),
  };
}

/**
 * Creates a venue as the given identity and reports the raw status, so a
 * caller can assert on 201 vs 403 instead of only on success.
 */
export async function createVenueAs(
  accessToken: string,
  name: string
): Promise<{ status: number; id?: string }> {
  const response = await apiRequest(accessToken, "/api/v1/venues", "POST", {
    name,
    slug: name,
    ianaTimezone: "America/Los_Angeles",
  });

  if (!response.ok) return { status: response.status };

  const body = (await response.json()) as { data?: { id?: string } };
  return { status: response.status, id: body.data?.id };
}

/**
 * Fastify runs its content-type parser on every method, DELETE included. A
 * request that declares `Content-Type: application/json` with a zero-length
 * body is rejected with `FST_ERR_CTP_EMPTY_JSON_BODY` (HTTP 400) before the
 * route handler ever executes (#4153) — so only set the header when there is
 * an actual body to describe.
 */
async function apiRequest(
  accessToken: string,
  path: string,
  method: string,
  body?: unknown
): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  return fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
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
 * Deletes every floor plan on the venue (best-effort). Onboarding always
 * creates a default floor plan (#4152), and `floorPlanService.delete` already
 * cascades that plan's own tables server-side — so clearing floor plans is
 * enough to unblock the venue delete for a synthetic-journey venue, without
 * touching the venue-delete API's dependents semantics for real venues.
 */
async function deleteVenueFloorPlans(accessToken: string, venueId: string): Promise<void> {
  const response = await apiRequest(
    accessToken,
    `/api/v1/floor-plans?venueId=${venueId}&limit=100`,
    "GET"
  );
  if (!response.ok) return; // best-effort — the retried delete below surfaces the real status either way
  const payload = (await response.json()) as { data?: { id: string }[] };
  for (const floorPlan of payload.data ?? []) {
    await apiRequest(accessToken, `/api/v1/floor-plans/${floorPlan.id}`, "DELETE");
  }
}

/**
 * Deletes a venue. `ok` is true when the venue is gone (204) or was already
 * gone (404); false for any other status. `status` is always the real HTTP
 * status, so the caller can report *why* a delete failed rather than just
 * that it did.
 *
 * A 409 (has tables/reservations) triggers one cleanup-and-retry: delete the
 * venue's floor plans, then retry the delete once. This clears the blocker
 * onboarding always creates, so a completed journey doesn't leak a synthetic
 * venue into prod (#4152). If dependents remain after that (e.g. real guest
 * or reservation data unexpectedly attached), the retried delete's own
 * status is reported — cleanup never masks a genuine conflict.
 */
export async function deleteVenue(
  accessToken: string,
  venueId: string
): Promise<DeleteVenueResult> {
  let response = await apiRequest(accessToken, `/api/v1/venues/${venueId}`, "DELETE");
  if (response.status === 409) {
    await deleteVenueFloorPlans(accessToken, venueId);
    response = await apiRequest(accessToken, `/api/v1/venues/${venueId}`, "DELETE");
  }
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
