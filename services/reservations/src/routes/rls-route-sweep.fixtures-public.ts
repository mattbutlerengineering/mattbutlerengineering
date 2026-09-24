import Stripe from "stripe";
import {
  ADMIN_HEADERS,
  asAdmin,
  expectBroken,
  expectOk,
  type ExpectBrokenOptions,
  type PayloadOrFactory,
  type RouteFixture,
  type SweepContext,
} from "./rls-route-sweep.fixtures.js";

/**
 * #5369 PR 2 — the public-funnel, token-route, and Stripe-webhook half of
 * the route sweep. Split out of `rls-route-sweep.fixtures.ts` (which had
 * grown past this repo's 800-line file guideline) rather than folded into
 * it — these routes share one property the staff API doesn't: EVERY one of
 * them is ADR-026 §3.3 item 3 or item 4, so there is no "ok" fixture in this
 * file at all, only KNOWN_BROKEN.
 *
 * Item 3 (`venueService.getBySlug`/`getPublicConfigBySlug`, an unscoped read
 * addressed by slug — the global preHandler has no `venueId` to resolve from
 * a slug) covers the entire `/public/v1/venues/:slug/*` funnel. Item 4
 * (token-addressed guest surfaces, plus the Stripe webhook's
 * `depositService.getByPaymentIntentId`) covers the manage/confirm/
 * unsubscribe routes and the webhook. One admin-shaped request is enough to
 * prove each: none of these routes have a `requireVenueAccess` guard at all
 * (they authenticate via slug, a capability token, or a webhook signature,
 * never a JWT + membership check), so there is no "member" leg to run.
 */

async function loadTokenHelpers(): Promise<{
  generateManageToken: (reservationId: string, guestEmail: string) => string;
  generateUnsubscribeToken: (guestId: string) => string;
}> {
  const [{ generateManageToken }, { generateUnsubscribeToken }] = await Promise.all([
    import("./public-reservations.js"),
    import("../services/post-visit-notifier.js"),
  ]);
  return { generateManageToken, generateUnsubscribeToken };
}

/** A headers value, or a factory reading it off {@link SweepContext} (e.g. the seeded `holdSessionId`). */
type HeadersOrFactory = Record<string, string> | ((ctx: SweepContext) => Record<string, string>);

function brokenPublic(
  blocker: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  urlFor: (ctx: SweepContext) => string,
  payloadFor?: PayloadOrFactory,
  options: { headersFor?: HeadersOrFactory; expectBrokenOptions?: ExpectBrokenOptions } = {}
): RouteFixture {
  return {
    kind: "broken",
    blocker,
    run: async (ctx) => {
      const url = urlFor(ctx);
      const payload = typeof payloadFor === "function" ? payloadFor(ctx) : payloadFor;
      const headers =
        typeof options.headersFor === "function" ? options.headersFor(ctx) : options.headersFor;
      expectBroken(
        await asAdmin(ctx, { method, url, payload, ...(headers ? { headers } : {}) }),
        `${method} ${url}`,
        ctx,
        options.expectBrokenOptions
      );
    },
  };
}

const publicFunnelFixtures: Record<string, RouteFixture> = {
  "GET /public/v1/venues/:slug": brokenPublic(
    "item-3",
    "GET",
    (ctx) => `/public/v1/venues/${ctx.venueA.slug}`
  ),
  "GET /public/v1/venues/:slug/availability": brokenPublic(
    "item-3",
    "GET",
    (ctx) => `/public/v1/venues/${ctx.venueA.slug}/availability?date=2026-10-01&partySize=2`
  ),
  "POST /public/v1/venues/:slug/holds": brokenPublic(
    "item-3",
    "POST",
    (ctx) => `/public/v1/venues/${ctx.venueA.slug}/holds`,
    { date: "2026-10-08", startTime: "2026-10-08T18:00:00Z", partySize: 2 }
  ),
  // Every route below that resolves `resolveVenueBySlug`/`getBySlug` before
  // it ever looks at the hold requires SOME `x-session-id` header just to get
  // PAST `readSessionId`'s 401 — none of these need a REAL session (the
  // unscoped slug read throws before any session/hold comparison runs), so a
  // fixed placeholder string is enough. Without it these five fixtures were
  // passing on a coincidental 401, never reaching item-3 at all.
  "GET /public/v1/venues/:slug/holds/:holdId": brokenPublic(
    "item-3",
    "GET",
    (ctx) => `/public/v1/venues/${ctx.venueA.slug}/holds/does-not-exist`,
    undefined,
    { headersFor: () => ({ "x-session-id": "rls-sweep-session" }) }
  ),
  // `reservation_holds` carries no RLS policy at all (ADR-026 §1) and this
  // route never resolves the venue by slug at all — no `resolveVenueBySlug`
  // call in `public-holds.ts`'s DELETE handler — so it's genuinely not-rls,
  // not item-3, and `holdService.release` is idempotent (always 204,
  // matching/nonexistent holdId alike).
  "DELETE /public/v1/venues/:slug/holds/:holdId": {
    kind: "not-rls",
    run: async (ctx) => {
      expectOk(
        await asAdmin(ctx, {
          method: "DELETE",
          url: `/public/v1/venues/${ctx.venueA.slug}/holds/does-not-exist`,
          headers: { "x-session-id": "rls-sweep-session" },
        }),
        "release hold (public, always-204, not-rls)"
      );
    },
  },
  "POST /public/v1/venues/:slug/holds/:holdId/confirm": brokenPublic(
    "item-3",
    "POST",
    (ctx) => `/public/v1/venues/${ctx.venueA.slug}/holds/does-not-exist/confirm`,
    { guestName: "RLS Sweep", guestEmail: "rls-sweep-public@example.com" },
    { headersFor: () => ({ "x-session-id": "rls-sweep-session" }) }
  ),
  "POST /public/v1/venues/:slug/reservations": brokenPublic(
    "item-3",
    "POST",
    (ctx) => `/public/v1/venues/${ctx.venueA.slug}/reservations`,
    {
      holdId: "does-not-exist",
      guestName: "RLS Sweep",
      guestEmail: "rls-sweep-public@example.com",
    },
    { headersFor: () => ({ "x-session-id": "rls-sweep-session" }) }
  ),
  "GET /public/v1/venues/:slug/guests/recognize": brokenPublic(
    "item-3",
    "GET",
    (ctx) =>
      `/public/v1/venues/${ctx.venueA.slug}/guests/recognize?email=rls-sweep-public@example.com`
  ),
  "GET /public/v1/venues/:slug/guest-risk": brokenPublic(
    "item-3",
    "GET",
    (ctx) => `/public/v1/venues/${ctx.venueA.slug}/guest-risk?email=rls-sweep-public@example.com`
  ),
  // `body.venueId` is REQUIRED by this route's own schema but its handler
  // never reads it for venue resolution ("never trusts a client-supplied
  // venueId, which could target another venue" — its own doc comment); it
  // exists in the body only because the shared `CreateWaitlistBodySchema` is
  // reused from the staff route. Supplying the SLUG'S OWN venue id here
  // would coincidentally set `app.venue_id` correctly via the GLOBAL
  // preHandler (which also reads `body.venueId`) and mask this exact gap —
  // a mismatched id is what an untrusting client (or an attacker) actually
  // sends, and is what proves `getBySlug` is still the unscoped read #3 says
  // it is: scoped to the WRONG venue, venue A's own row becomes invisible.
  //
  // NAMED EXCEPTION to the tripwire assertion: `app.venue_id` IS resolved
  // here (to venue B, from `body.venueId`), so `venueService.getBySlug`
  // never hits the unscoped-context tripwire at all — it runs a genuinely
  // SCOPED read that returns no rows because venue A's row is invisible
  // under venue B's scope. That's still item-3 (the wrong-tenant denial is
  // the same underlying bug), just the RLS-enforced-404 shape rather than a
  // thrown `RlsUnscopedQueryError` — see `ExpectBrokenOptions.deniedStatus`.
  "POST /public/v1/venues/:slug/waitlist": brokenPublic(
    "item-3",
    "POST",
    (ctx) => `/public/v1/venues/${ctx.venueA.slug}/waitlist`,
    (ctx) => ({
      venueId: ctx.venueB.id,
      partySize: 2,
      guestName: "RLS Sweep",
      guestPhone: "+15550002222",
    }),
    { expectBrokenOptions: { deniedStatus: 404 } }
  ),
  "POST /public/v1/venues/:slug/deposits/payment-intent": brokenPublic(
    "item-3",
    "POST",
    (ctx) => `/public/v1/venues/${ctx.venueA.slug}/deposits/payment-intent`,
    { reservationId: "does-not-exist", guestEmail: "rls-sweep-public@example.com" }
  ),
};

/**
 * Holds (staff confirm route) — a discovery beyond ADR-026 §3.3's own eight
 * items, found while building this sweep. `POST /api/v1/holds` and its
 * plain GET/DELETE siblings are genuinely "not-rls" (see the main fixtures
 * file): `reservation_holds` carries no RLS policy at all. But `.../confirm`
 * (`confirm-hold.ts`) additionally resolves the hold's venue via an
 * unscoped `prisma.venue.findUnique({ where: { id: hold.venueId } })` before
 * creating the resulting reservation — the identical "lookup can't run
 * inside the scope it's computing" shape as items 1-8, just on a table the
 * ADR's own audit never named. Filed here rather than silently rolled into
 * the not-rls bucket precisely because it IS an RLS-table read.
 *
 * `confirmHold`'s session check (Step 2) runs BEFORE the unscoped venue
 * lookup and rejects a mismatched session with `SESSION_MISMATCH` — so this
 * needs the hold's REAL seeded session id, not a placeholder, to actually
 * reach the bug rather than a coincidental 403 one step earlier.
 */
const holdConfirmFixtures: Record<string, RouteFixture> = {
  "POST /api/v1/holds/:id/confirm": brokenPublic(
    "sweep-discovered",
    "POST",
    (ctx) => `/api/v1/holds/${ctx.holdA}/confirm`,
    { guestName: "RLS Sweep", guestEmail: "rls-sweep-confirm@example.com" },
    { headersFor: (ctx) => ({ "x-session-id": ctx.holdSessionId }) }
  ),
};

/**
 * Token-addressed guest surfaces (ADR-026 §3.3 item 4). Each token is
 * generated with the SAME module the route verifies against
 * (`generateManageToken`/`generateUnsubscribeToken`), so a real, validly
 * signed token reaches the handler and the failure is the unscoped
 * `reservationService.getById`/`guestService.markUnsubscribed` read itself —
 * never the token check ahead of it.
 */
const tokenRouteFixtures: Record<string, RouteFixture> = {
  "GET /public/v1/reservations/manage": {
    kind: "broken",
    blocker: "item-4",
    run: async (ctx) => {
      const { generateManageToken } = await loadTokenHelpers();
      const token = generateManageToken(ctx.reservationA, ctx.reservationAGuestEmail);
      expectBroken(
        await asAdmin(ctx, { method: "GET", url: `/public/v1/reservations/manage?token=${token}` }),
        "GET manage",
        ctx
      );
    },
  },
  "PATCH /public/v1/reservations/manage": {
    kind: "broken",
    blocker: "item-4",
    run: async (ctx) => {
      const { generateManageToken } = await loadTokenHelpers();
      const token = generateManageToken(ctx.reservationA, ctx.reservationAGuestEmail);
      expectBroken(
        await asAdmin(ctx, {
          method: "PATCH",
          url: `/public/v1/reservations/manage?token=${token}`,
          payload: { partySize: 3 },
        }),
        "PATCH manage",
        ctx
      );
    },
  },
  "DELETE /public/v1/reservations/manage": {
    kind: "broken",
    blocker: "item-4",
    run: async (ctx) => {
      const { generateManageToken } = await loadTokenHelpers();
      const token = generateManageToken(ctx.reservationA, ctx.reservationAGuestEmail);
      expectBroken(
        await asAdmin(ctx, {
          method: "DELETE",
          url: `/public/v1/reservations/manage?token=${token}`,
        }),
        "DELETE manage",
        ctx
      );
    },
  },
  "PATCH /public/v1/reservations/confirm": {
    kind: "broken",
    blocker: "item-4",
    run: async (ctx) => {
      const { generateManageToken } = await loadTokenHelpers();
      const token = generateManageToken(ctx.reservationA, ctx.reservationAGuestEmail);
      expectBroken(
        await asAdmin(ctx, {
          method: "PATCH",
          url: `/public/v1/reservations/confirm?token=${token}`,
        }),
        "confirm attendance",
        ctx
      );
    },
  },
  "GET /public/v1/guests/unsubscribe": {
    kind: "broken",
    blocker: "item-4",
    run: async (ctx) => {
      const { generateUnsubscribeToken } = await loadTokenHelpers();
      const token = generateUnsubscribeToken(ctx.guestA);
      // public-unsubscribe.ts wraps guestService.markUnsubscribed(...) in its
      // own try/catch and manually replies 500 with a plain problem-details
      // object (never re-throws), so the tripwire's RlsUnscopedQueryError
      // never propagates to Fastify's onError hook — status is the only
      // evidence available here.
      expectBroken(
        await asAdmin(ctx, { method: "GET", url: `/public/v1/guests/unsubscribe?token=${token}` }),
        "unsubscribe",
        ctx,
        { deniedStatus: 500 }
      );
    },
  },
};

/**
 * The Stripe webhook (item 4's other half): `onPaymentIntentSucceeded`
 * calls `depositService.getByPaymentIntentId` — unscoped — before it can
 * even discover which venue's deposit it's transitioning. Signed with the
 * real `stripe` SDK's own test-signature helper against the SAME
 * `STRIPE_WEBHOOK_SECRET` the app was booted with, so signature
 * verification passes and the failure is the RLS read behind it.
 */
const stripeWebhookFixtures: Record<string, RouteFixture> = {
  "POST /api/v1/stripe/webhook": {
    kind: "broken",
    blocker: "item-4",
    run: async (ctx) => {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET must be set before this fixture runs");

      const event = {
        id: "evt_rls_sweep_test",
        object: "event",
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_rls_sweep_test", object: "payment_intent" } },
      };
      const payload = JSON.stringify(event);
      const signature = await Stripe.webhooks.generateTestHeaderStringAsync({ payload, secret });

      // Bypasses the shared `inject()` helper (raw body needed for the
      // signature, and no `x-auth-bypass` gate applies to a webhook) — reset
      // the tripwire tracker by hand, same contract `inject()` gives every
      // other fixture.
      ctx.lastRlsErrorName = null;
      const res = await ctx.app.inject({
        method: "POST",
        url: "/api/v1/stripe/webhook",
        headers: {
          ...ADMIN_HEADERS,
          "stripe-signature": signature,
          "content-type": "application/json",
        },
        payload,
      });
      // stripe-webhook.ts's own try/catch around webhookRouter.dispatch(...)
      // catches the tripwire's thrown error and manually replies 500 with a
      // plain problem-details object (by design — Stripe should retry a
      // handler failure) rather than re-throwing, so onError never fires.
      expectBroken(res, "stripe webhook payment_intent.succeeded", ctx, { deniedStatus: 500 });
    },
  },
};

export const PUBLIC_FIXTURES: Record<string, RouteFixture> = {
  ...publicFunnelFixtures,
  ...holdConfirmFixtures,
  ...tokenRouteFixtures,
  ...stripeWebhookFixtures,
};
