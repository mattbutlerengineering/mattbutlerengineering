import { randomUUID } from "crypto";
import type {
  Venue,
  VenueGroup,
  VenueSettings,
  DepositType,
  PublicVenue,
  PublicVenueConfig,
  CreateVenueRequest,
  UpdateVenueRequest,
  CreateVenueGroupRequest,
  UpdateVenueGroupRequest,
  PaginatedResponse,
} from "@mbe/types";
import {
  paginate,
  toPaginationMeta,
  isPrismaNotFound,
  isPrismaForeignKeyViolation,
} from "@mbe/database";
import type { Prisma } from "../generated/prisma/index.js";
import { prisma } from "./database.js";
import { runWithVenueContext } from "./venue-context-store.js";
import { getMemberVenueIds } from "./member-venues.js";
import { setVenueContext } from "../middleware/venue-context.js";

/**
 * Outcome of {@link venueService.delete} — distinguishes "gone" from "blocked
 * by a required relation" so the route can return the documented 409 instead
 * of an unhandled 500 (#4152).
 */
export type VenueDeleteOutcome = "deleted" | "not_found" | "has_dependents";

/**
 * Typed projection of a venue's deposit & cancellation policy, plus the
 * identity and currency needed to act on it. Returned by
 * {@link venueService.getPolicyById} / {@link venueService.getPolicyBySlug} so the
 * deposit/cancellation money path consumes exactly these fields behind the
 * serializer seam — never a raw Prisma venue row.
 */
export interface VenuePolicy {
  id: string;
  slug: string;
  currencyCode: string;
  depositEnabled: boolean;
  depositType: DepositType | null;
  depositAmountCents: number | null;
  freeCancellationHours: number | null;
  lateCancellationFeePercent: number | null;
  noShowFeePercent: number | null;
}

/** Exact set of columns projected onto {@link VenuePolicy} — no other row data escapes. */
const venuePolicySelect = {
  id: true,
  slug: true,
  currencyCode: true,
  depositEnabled: true,
  depositType: true,
  depositAmountCents: true,
  freeCancellationHours: true,
  lateCancellationFeePercent: true,
  noShowFeePercent: true,
} satisfies Prisma.VenueSelect;

function mapVenuePolicy(row: {
  id: string;
  slug: string;
  currencyCode: string;
  depositEnabled: boolean;
  depositType: DepositType | null;
  depositAmountCents: number | null;
  freeCancellationHours: number | null;
  lateCancellationFeePercent: number | null;
  noShowFeePercent: number | null;
}): VenuePolicy {
  return {
    id: row.id,
    slug: row.slug,
    currencyCode: row.currencyCode,
    depositEnabled: row.depositEnabled,
    depositType: row.depositType,
    depositAmountCents: row.depositAmountCents,
    freeCancellationHours: row.freeCancellationHours,
    lateCancellationFeePercent: row.lateCancellationFeePercent,
    noShowFeePercent: row.noShowFeePercent,
  };
}

function mapPrismaVenueGroup(group: {
  id: string;
  name: string;
  slug: string;
  settings: unknown;
  createdAt: Date;
}): VenueGroup {
  return {
    id: group.id,
    name: group.name,
    slug: group.slug,
    settings: group.settings as Record<string, unknown> | null,
    createdAt: group.createdAt.toISOString(),
  };
}

/**
 * A `venues` row joined to its (optional) `venue_groups` row, as
 * `app_cross_venue_venues()` returns it — Postgres column names, because this
 * one read goes through `$queryRaw` rather than a Prisma delegate (see
 * {@link venueService.list}).
 */
interface CrossVenueVenueRow {
  id: string;
  venue_group_id: string | null;
  name: string;
  slug: string;
  iana_timezone: string;
  currency_code: string;
  operating_hours: unknown;
  settings: unknown;
  created_at: Date;
  updated_at: Date;
  group_id: string | null;
  group_name: string | null;
  group_slug: string | null;
  group_settings: unknown;
  group_created_at: Date | null;
}

/**
 * Re-shapes a raw cross-venue row into the same object {@link mapPrismaVenue}
 * already consumes, so the raw read shares one serializer with every Prisma
 * read rather than growing a second mapping of the same fields.
 */
function mapCrossVenueRow(row: CrossVenueVenueRow): Venue {
  const group =
    row.group_id !== null && row.group_name !== null && row.group_slug !== null
      ? {
          id: row.group_id,
          name: row.group_name,
          slug: row.group_slug,
          settings: row.group_settings,
          createdAt: row.group_created_at ?? row.created_at,
        }
      : null;

  return mapPrismaVenue({
    id: row.id,
    venueGroupId: row.venue_group_id,
    venueGroup: group,
    name: row.name,
    slug: row.slug,
    ianaTimezone: row.iana_timezone,
    currencyCode: row.currency_code,
    operatingHours: row.operating_hours,
    settings: row.settings,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapPrismaVenue(venue: {
  id: string;
  venueGroupId: string | null;
  venueGroup?: {
    id: string;
    name: string;
    slug: string;
    settings: unknown;
    createdAt: Date;
  } | null;
  name: string;
  slug: string;
  ianaTimezone: string;
  currencyCode: string;
  operatingHours: unknown;
  settings: unknown;
  createdAt: Date;
  updatedAt: Date;
}): Venue {
  return {
    id: venue.id,
    venueGroupId: venue.venueGroupId,
    venueGroup: venue.venueGroup ? mapPrismaVenueGroup(venue.venueGroup) : undefined,
    name: venue.name,
    slug: venue.slug,
    ianaTimezone: venue.ianaTimezone,
    currencyCode: venue.currencyCode,
    operatingHours: venue.operatingHours as Venue["operatingHours"],
    settings: venue.settings as Venue["settings"],
    createdAt: venue.createdAt.toISOString(),
    updatedAt: venue.updatedAt.toISOString(),
  };
}

/**
 * Thrown when a non-admin attempts to create a venue while already holding a
 * venue membership. Raised INSIDE the creation transaction, so it also covers
 * the case where the membership appeared after the preHandler guard admitted
 * the request. Routes map it to 403.
 */
export class VenueBootstrapForbiddenError extends Error {
  constructor(userSub: string) {
    super(`User ${userSub} already holds a venue membership and cannot bootstrap another venue`);
    this.name = "VenueBootstrapForbiddenError";
  }
}

export const venueGroupService = {
  async list(page: number, limit: number): Promise<PaginatedResponse<VenueGroup>> {
    const [groups, total] = await Promise.all([
      prisma.venueGroup.findMany({
        ...paginate({ page, limit }),
        orderBy: { name: "asc" },
      }),
      prisma.venueGroup.count(),
    ]);

    return {
      data: groups.map(mapPrismaVenueGroup),
      pagination: toPaginationMeta(page, limit, total),
    };
  },

  async getById(id: string): Promise<VenueGroup | null> {
    const group = await prisma.venueGroup.findUnique({ where: { id } });
    return group ? mapPrismaVenueGroup(group) : null;
  },

  async getBySlug(slug: string): Promise<VenueGroup | null> {
    const group = await prisma.venueGroup.findUnique({ where: { slug } });
    return group ? mapPrismaVenueGroup(group) : null;
  },

  async create(data: CreateVenueGroupRequest): Promise<VenueGroup> {
    const group = await prisma.venueGroup.create({
      data: {
        name: data.name,
        slug: data.slug,
        settings: data.settings as Prisma.InputJsonValue | undefined,
      },
    });
    return mapPrismaVenueGroup(group);
  },

  async update(id: string, data: UpdateVenueGroupRequest): Promise<VenueGroup | null> {
    try {
      const updateData: Prisma.VenueGroupUpdateInput = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.slug !== undefined) updateData.slug = data.slug;
      if (data.settings !== undefined) updateData.settings = data.settings as Prisma.InputJsonValue;

      const group = await prisma.venueGroup.update({
        where: { id },
        data: updateData,
      });
      return mapPrismaVenueGroup(group);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.venueGroup.delete({ where: { id } });
      return true;
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return false;
      throw err;
    }
  },
};

// Approximates the en_US database collation the removed
// `orderBy: { name: "asc" }` used (case- and accent-aware), so moving the
// sort into application code doesn't reorder venues or change page 1.
const VENUE_NAME_COLLATOR = new Intl.Collator("en-US");

export const venueService = {
  /**
   * Lists venues across every venue — the platform-`admin` surface
   * (`GET /api/v1/venues` when the caller is an admin; non-admins get
   * {@link venueService.listForMember}).
   *
   * This is one of the two irreducibly cross-venue reads ADR-026 §3 tracked as
   * open prerequisites, so it goes through that ADR's one escape hatch,
   * `app_cross_venue_venues()`
   * (`prisma/migrations/20260920000000_add_cross_venue_read_escape_hatch`): a
   * `SECURITY DEFINER` function admitted by a `SELECT`-only policy keyed on the
   * transaction-local marker the function sets and restores around its own
   * `venues` scan. `venues`' `venue_isolation` policy compares each row's own
   * `id` against a single `app.venue_id`, so no value of that setting makes a
   * cross-venue list correct — a Prisma delegate read here returns every row
   * today only because the service connects as the table owner (#5369), and
   * would return ZERO rows under `FORCE ROW LEVEL SECURITY`.
   *
   * `$queryRaw` is required (Prisma cannot call a set-returning function
   * through a delegate) and is safe: the tagged template binds every value as
   * a parameter, never interpolating SQL. `venue_groups` carries no RLS policy
   * of its own, so the group join needs no escape hatch. Ordering, pagination
   * and the count stay in this query rather than in the function, so the
   * function has no pagination contract to keep in sync.
   */
  async list(
    page: number,
    limit: number,
    venueGroupId?: string
  ): Promise<PaginatedResponse<Venue>> {
    const { skip, take } = paginate({ page, limit });
    const groupFilter = venueGroupId ?? null;

    const [rows, totals] = await Promise.all([
      prisma.$queryRaw<CrossVenueVenueRow[]>`
        SELECT v.*,
               g.id AS group_id,
               g.name AS group_name,
               g.slug AS group_slug,
               g.settings AS group_settings,
               g.created_at AS group_created_at
        FROM app_cross_venue_venues(${groupFilter}::text) v
        LEFT JOIN venue_groups g ON g.id = v.venue_group_id
        ORDER BY v.name ASC
        LIMIT ${take} OFFSET ${skip}`,
      prisma.$queryRaw<{ total: number }[]>`
        SELECT count(*)::int AS total FROM app_cross_venue_venues(${groupFilter}::text)`,
    ]);

    return {
      data: rows.map(mapCrossVenueRow),
      pagination: toPaginationMeta(page, limit, totals[0]?.total ?? 0),
    };
  },

  /**
   * Lists only the venues the given operator is a member of (owns or was
   * invited to), scoped via VenueMembership (ADR-020). Platform admins bypass
   * this and use `list` instead.
   *
   * This is the other of ADR-026 §3.2's two newly-open cross-venue reads (#5369):
   * a single `venue.findMany` filtered by `memberships: { some: { userSub } }`
   * is an application predicate, not a value of `app.venue_id`, so it returns
   * ZERO rows under `FORCE ROW LEVEL SECURITY` for any member of more than one
   * venue. Fixed by fanning out one venue at a time instead of a single
   * cross-venue delegate call: {@link getMemberVenueIds} reads the member's
   * venue ids straight off `venue_memberships` (no RLS policy at all, so this
   * first step needs no escape hatch), then each venue is read inside
   * `runWithVenueContext` — `venues`' own `venue_isolation` policy admits a
   * session whose `app.venue_id` equals that row's own `id`, so this is a
   * correctly-scoped single-venue read, not a cross-venue one. Ordering,
   * `venueGroupId` filtering and pagination move from the database into this
   * function because the fan-out can no longer express them as one query.
   */
  async listForMember(
    userSub: string,
    page: number,
    limit: number,
    venueGroupId?: string
  ): Promise<PaginatedResponse<Venue>> {
    const venueIds = await getMemberVenueIds(userSub);

    const rows = await Promise.all(
      venueIds.map((venueId) =>
        runWithVenueContext(venueId, () =>
          prisma.venue.findUnique({ where: { id: venueId }, include: { venueGroup: true } })
        )
      )
    );

    const venues = rows
      .filter((venue): venue is NonNullable<typeof venue> => venue !== null)
      .filter((venue) => !venueGroupId || venue.venueGroupId === venueGroupId)
      .sort((a, b) => VENUE_NAME_COLLATOR.compare(a.name, b.name));

    const { skip, take } = paginate({ page, limit });

    return {
      data: venues.slice(skip, skip + take).map(mapPrismaVenue),
      pagination: toPaginationMeta(page, limit, venues.length),
    };
  },

  async getById(id: string): Promise<Venue | null> {
    const venue = await prisma.venue.findUnique({
      where: { id },
      include: { venueGroup: true },
    });
    return venue ? mapPrismaVenue(venue) : null;
  },

  async getBySlug(slug: string, venueGroupId?: string): Promise<Venue | null> {
    const venue = await prisma.venue.findFirst({
      where: { slug, ...(venueGroupId ? { venueGroupId } : {}) },
      include: { venueGroup: true },
    });
    return venue ? mapPrismaVenue(venue) : null;
  },

  /**
   * Returns the curated public {@link PublicVenue} projection by slug, or
   * `null` when the venue does not exist. Used by the unauthenticated
   * booking-widget entry point (`GET /api/v1/venues/by-slug/:slug`) so
   * `venueGroup`/`venueGroupId` never leave the database row for an
   * anonymous caller (#4022). `settings.maxPartySize` and `phone` are
   * forwarded out of the raw `settings` JSON blob (#4979) — the rest of it
   * still never leaves this projection.
   */
  async getPublicBySlug(slug: string): Promise<PublicVenue | null> {
    const venue = await prisma.venue.findFirst({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        ianaTimezone: true,
        operatingHours: true,
        settings: true,
      },
    });
    if (!venue) return null;

    const settings = venue.settings as VenueSettings | null;

    return {
      id: venue.id,
      name: venue.name,
      slug: venue.slug,
      ianaTimezone: venue.ianaTimezone,
      operatingHours: venue.operatingHours as PublicVenue["operatingHours"],
      settings:
        settings?.maxPartySize != null ? { maxPartySize: settings.maxPartySize } : undefined,
      phone: settings?.phone,
    };
  },

  /**
   * Returns the venue's deposit/cancellation {@link VenuePolicy} by ID, or `null`
   * when the venue does not exist. Projects exactly the policy columns so the
   * money path (cancellation, modification) never touches a raw Prisma row.
   */
  async getPolicyById(id: string): Promise<VenuePolicy | null> {
    const venue = await prisma.venue.findUnique({
      where: { id },
      select: venuePolicySelect,
    });
    return venue ? mapVenuePolicy(venue) : null;
  },

  /**
   * Returns the venue's deposit/cancellation {@link VenuePolicy} by slug, or `null`
   * when the venue does not exist. Used by the public deposit-intent flow.
   */
  async getPolicyBySlug(slug: string): Promise<VenuePolicy | null> {
    const venue = await prisma.venue.findFirst({
      where: { slug },
      select: venuePolicySelect,
    });
    return venue ? mapVenuePolicy(venue) : null;
  },

  /**
   * Returns the typed public booking-widget config for a venue slug, or `null`
   * when the venue does not exist. Assembles the base config and deposit policy
   * behind the serializer seam so the public route never handles a raw Prisma
   * row (nor internal fields like `id`/`venueGroupId`).
   */
  async getPublicConfigBySlug(slug: string): Promise<PublicVenueConfig | null> {
    const venue = await prisma.venue.findFirst({
      where: { slug },
      select: {
        name: true,
        slug: true,
        ianaTimezone: true,
        currencyCode: true,
        operatingHours: true,
        settings: true,
        depositEnabled: true,
        depositType: true,
        depositAmountCents: true,
        freeCancellationHours: true,
        lateCancellationFeePercent: true,
        noShowFeePercent: true,
      },
    });
    if (!venue) return null;

    const settings = venue.settings as VenueSettings | null;

    return {
      name: venue.name,
      slug: venue.slug,
      ianaTimezone: venue.ianaTimezone,
      currencyCode: venue.currencyCode,
      operatingHours: venue.operatingHours as PublicVenueConfig["operatingHours"],
      settings: {
        defaultReservationDuration: settings?.defaultReservationDuration,
        maxPartySize: settings?.maxPartySize,
        maxAdvanceBooking: settings?.maxAdvanceBooking,
        slotIntervalMinutes: settings?.slotIntervalMinutes,
      },
      deposit: {
        enabled: venue.depositEnabled,
        depositType: venue.depositType,
        amountCents: venue.depositAmountCents,
        freeCancellationHours: venue.freeCancellationHours,
        lateCancellationFeePercent: venue.lateCancellationFeePercent,
        noShowFeePercent: venue.noShowFeePercent,
      },
    };
  },

  /**
   * Creates a venue, optionally seeding `ownerSub` as its owner. Both
   * writes (the venue row and, when `ownerSub` is supplied, its owner
   * VenueMembership) share one transaction so a venue never persists without
   * its owner grant.
   *
   * When an `ownerSub` is supplied, `opts.isAdmin` decides whether the
   * first-venue bootstrap invariant applies (ADR-020, third case). It defaults
   * to `false` — the fail-CLOSED direction — so a caller that forgets to pass
   * it gets the invariant enforced rather than silently skipped.
   *
   * ADR-026 §3.3 item 8 / #5369 PR 7: `venues`' `venue_isolation` policy keys
   * on the row's own `id`, but that id does not exist until this call creates
   * it — there is no PRIOR venue context a preHandler could have resolved for
   * an INSERT. The id is generated up front (`randomUUID()`, overriding the
   * schema's client-side `@default(cuid())`, which is inert if a caller
   * already supplies `data.id`) so it can be set as `app.venue_id` on the
   * SAME transaction that inserts the row — `setVenueContext(tx, id)` as the
   * transaction's first statement, matching the explicit-transaction pattern
   * `reservation.ts`/`floor-plan.ts` already use, never
   * `app.cross_venue` (that marker is for reads that cannot name a single
   * venue; this INSERT names exactly one, the venue it is creating).
   * Previously this used the top-level `prisma` export for the ownerSub-less
   * branch (its own per-call auto-wrap transaction, but with
   * `getCurrentVenueId()` reading whatever the REQUEST resolved — never this
   * new row's id) and an unwrapped `prisma.$transaction(...)` with no venue
   * context at all for the ownerSub branch — both left `app.venue_id` unset,
   * so the FORCE'd policy's `WITH CHECK` rejected every create.
   */
  async create(
    data: CreateVenueRequest,
    ownerSub?: string,
    opts: { isAdmin?: boolean } = {}
  ): Promise<Venue> {
    const venueData = {
      id: randomUUID(),
      venueGroupId: data.venueGroupId,
      name: data.name,
      slug: data.slug,
      ianaTimezone: data.ianaTimezone,
      currencyCode: data.currencyCode ?? "USD",
      operatingHours: data.operatingHours as Prisma.InputJsonValue | undefined,
      settings: data.settings as Prisma.InputJsonValue | undefined,
    };

    if (!ownerSub) {
      const venue = await prisma.$transaction(async (tx) => {
        await setVenueContext(tx, venueData.id);
        return tx.venue.create({ data: venueData, include: { venueGroup: true } });
      });
      return mapPrismaVenue(venue);
    }

    const venue = await prisma.$transaction(
      async (tx) => {
        await setVenueContext(tx, venueData.id);

        // The preHandler guard reads membership OUTSIDE this transaction, so
        // two concurrent bootstraps can both pass it. This re-check is the
        // authority; Serializable isolation below closes the remaining window
        // that READ COMMITTED would leave open.
        if (!opts.isAdmin) {
          const existing = await tx.venueMembership.count({ where: { userSub: ownerSub } });
          if (existing > 0) {
            throw new VenueBootstrapForbiddenError(ownerSub);
          }
        }

        const created = await tx.venue.create({
          data: venueData,
          include: { venueGroup: true },
        });
        await tx.venueMembership.create({
          data: { userSub: ownerSub, venueId: created.id, role: "owner" },
        });
        return created;
      },
      { isolationLevel: "Serializable" }
    );
    return mapPrismaVenue(venue);
  },

  async update(id: string, data: UpdateVenueRequest): Promise<Venue | null> {
    try {
      const updateData: Prisma.VenueUpdateInput = {};
      if (data.venueGroupId !== undefined) {
        updateData.venueGroup = data.venueGroupId
          ? { connect: { id: data.venueGroupId } }
          : { disconnect: true };
      }
      if (data.name !== undefined) updateData.name = data.name;
      if (data.slug !== undefined) updateData.slug = data.slug;
      if (data.ianaTimezone !== undefined) updateData.ianaTimezone = data.ianaTimezone;
      if (data.currencyCode !== undefined) updateData.currencyCode = data.currencyCode;
      if (data.operatingHours !== undefined) {
        updateData.operatingHours = data.operatingHours as Prisma.InputJsonValue | undefined;
      }
      if (data.settings !== undefined) {
        updateData.settings = data.settings as Prisma.InputJsonValue | undefined;
      }

      const venue = await prisma.venue.update({
        where: { id },
        data: updateData,
        include: { venueGroup: true },
      });
      return mapPrismaVenue(venue);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },

  async delete(id: string): Promise<VenueDeleteOutcome> {
    try {
      await prisma.venue.delete({ where: { id } });
      return "deleted";
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return "not_found";
      if (isPrismaForeignKeyViolation(err)) return "has_dependents";
      throw err;
    }
  },
};
