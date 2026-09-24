import Stripe from "stripe";
import type { InjectOptions } from "fastify";
import {
  ADMIN_HEADERS,
  asAdmin,
  expectBroken,
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

type PayloadOrFactory =
  InjectOptions["payload"] | ((ctx: SweepContext) => InjectOptions["payload"]);

function brokenPublic(
  blocker: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  urlFor: (ctx: SweepContext) => string,
  payloadFor?: PayloadOrFactory
): RouteFixture {
  return {
    kind: "broken",
    blocker,
    run: async (ctx) => {
      const url = urlFor(ctx);
      const payload = typeof payloadFor === "function" ? payloadFor(ctx) : payloadFor;
      expectBroken(await asAdmin(ctx, { method, url, payload }), `${method} ${url}`);
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
  "GET /public/v1/venues/:slug/holds/:holdId": brokenPublic(
    "item-3",
    "GET",
    (ctx) => `/public/v1/venues/${ctx.venueA.slug}/holds/does-not-exist`
  ),
  "DELETE /public/v1/venues/:slug/holds/:holdId": brokenPublic(
    "item-3",
    "DELETE",
    (ctx) => `/public/v1/venues/${ctx.venueA.slug}/holds/does-not-exist`
  ),
  "POST /public/v1/venues/:slug/holds/:holdId/confirm": brokenPublic(
    "item-3",
    "POST",
    (ctx) => `/public/v1/venues/${ctx.venueA.slug}/holds/does-not-exist/confirm`,
    { guestName: "RLS Sweep", guestEmail: "rls-sweep-public@example.com" }
  ),
  "POST /public/v1/venues/:slug/reservations": brokenPublic(
    "item-3",
    "POST",
    (ctx) => `/public/v1/venues/${ctx.venueA.slug}/reservations`,
    { holdId: "does-not-exist", guestName: "RLS Sweep", guestEmail: "rls-sweep-public@example.com" }
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
  "POST /public/v1/venues/:slug/waitlist": brokenPublic(
    "item-3",
    "POST",
    (ctx) => `/public/v1/venues/${ctx.venueA.slug}/waitlist`,
    (ctx) => ({
      venueId: ctx.venueB.id,
      partySize: 2,
      guestName: "RLS Sweep",
      guestPhone: "+15550002222",
    })
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
 */
const holdConfirmFixtures: Record<string, RouteFixture> = {
  "POST /api/v1/holds/:id/confirm": brokenPublic(
    "sweep-discovered",
    "POST",
    (ctx) => `/api/v1/holds/${ctx.holdA}/confirm`,
    { guestName: "RLS Sweep", guestEmail: "rls-sweep-confirm@example.com" }
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
        "GET manage"
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
        "PATCH manage"
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
        "DELETE manage"
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
        "confirm attendance"
      );
    },
  },
  "GET /public/v1/guests/unsubscribe": {
    kind: "broken",
    blocker: "item-4",
    run: async (ctx) => {
      const { generateUnsubscribeToken } = await loadTokenHelpers();
      const token = generateUnsubscribeToken(ctx.guestA);
      expectBroken(
        await asAdmin(ctx, { method: "GET", url: `/public/v1/guests/unsubscribe?token=${token}` }),
        "unsubscribe"
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
      expectBroken(res, "stripe webhook payment_intent.succeeded");
    },
  },
};

export const PUBLIC_FIXTURES: Record<string, RouteFixture> = {
  ...publicFunnelFixtures,
  ...holdConfirmFixtures,
  ...tokenRouteFixtures,
  ...stripeWebhookFixtures,
};
