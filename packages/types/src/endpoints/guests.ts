/**
 * The guests domain, declared once (docs/fixes/endpoint-definitions-pilot).
 *
 * Each entry is the single statement of one endpoint's wire contract. The
 * reservations service registers its routes from these
 * (`registerEndpoint`), and `GuestsClient` calls them (`ApiClient.call`);
 * `tools/route-contract` checks the two still agree. Response descriptions
 * live here because they are keyed by the same status as the schema; OpenAPI
 * prose (summary, operationId, tags, security) stays at the route.
 */
import { z } from "zod";
import { defineEndpoint, problem } from "./define.js";
import { paginatedResponseSchema } from "../schemas/common.js";
import {
  GuestSchema,
  GuestSegmentSchema,
  LapsingGuestSchema,
  WinBackResultSchema,
} from "../schemas/guest.js";
import {
  ListGuestsQuerySchema,
  SearchGuestsQuerySchema,
  GuestSegmentsQuerySchema,
  CreateGuestBodySchema,
  FindOrCreateGuestBodySchema,
  UpdateGuestBodySchema,
  AddGuestNoteBodySchema,
  LapsingGuestsQuerySchema,
} from "../schemas/reservation-requests.js";

/** Mounted at this prefix by the reservations service (ADR-007 /api/v1 versioning). */
export const GUESTS_PREFIX = "/api/v1/guests";

const GuestIdParamsSchema = z.object({ id: z.string().describe("Guest ID") });
const guestEnvelope = z.object({ data: GuestSchema });

const authRequired = problem("Authentication required");
const guestNotFound = problem("Guest not found");

export const guestsEndpoints = {
  list: defineEndpoint({
    method: "GET",
    path: `${GUESTS_PREFIX}`,
    query: ListGuestsQuerySchema,
    responses: {
      200: {
        description: "Successful response with paginated guest list",
        body: paginatedResponseSchema(GuestSchema),
      },
      401: authRequired,
    },
  }),
  search: defineEndpoint({
    method: "GET",
    path: `${GUESTS_PREFIX}/search`,
    query: SearchGuestsQuerySchema,
    responses: {
      200: { description: "Search results", body: paginatedResponseSchema(GuestSchema) },
      401: authRequired,
    },
  }),
  getSegments: defineEndpoint({
    method: "GET",
    path: `${GUESTS_PREFIX}/segments`,
    query: GuestSegmentsQuerySchema,
    responses: {
      200: { description: "Guest segments", body: z.object({ data: z.array(GuestSegmentSchema) }) },
      401: authRequired,
    },
  }),
  get: defineEndpoint({
    method: "GET",
    path: `${GUESTS_PREFIX}/:id`,
    params: GuestIdParamsSchema,
    responses: {
      200: { description: "Guest found", body: guestEnvelope },
      404: guestNotFound,
    },
  }),
  create: defineEndpoint({
    method: "POST",
    path: `${GUESTS_PREFIX}`,
    body: CreateGuestBodySchema,
    responses: {
      201: { description: "Guest created", body: guestEnvelope },
      400: problem("Invalid request or duplicate email/phone"),
      401: authRequired,
    },
  }),
  findOrCreate: defineEndpoint({
    method: "POST",
    path: `${GUESTS_PREFIX}/find-or-create`,
    body: FindOrCreateGuestBodySchema,
    responses: {
      200: { description: "Guest found or created", body: guestEnvelope },
      400: problem("Invalid request"),
      401: authRequired,
    },
  }),
  update: defineEndpoint({
    method: "PATCH",
    path: `${GUESTS_PREFIX}/:id`,
    params: GuestIdParamsSchema,
    body: UpdateGuestBodySchema,
    responses: {
      200: { description: "Guest updated", body: guestEnvelope },
      404: guestNotFound,
    },
  }),
  addNote: defineEndpoint({
    method: "POST",
    path: `${GUESTS_PREFIX}/:id/notes`,
    params: GuestIdParamsSchema,
    body: AddGuestNoteBodySchema,
    responses: {
      201: { description: "Note appended; returns updated guest", body: guestEnvelope },
      400: problem("Invalid request"),
      401: authRequired,
      404: guestNotFound,
    },
  }),
  getLapsing: defineEndpoint({
    method: "GET",
    path: `${GUESTS_PREFIX}/lapsing`,
    query: LapsingGuestsQuerySchema,
    responses: {
      200: {
        description: "Lapsing guests list",
        body: z.object({ data: z.array(LapsingGuestSchema) }),
      },
      400: problem(),
      401: problem(),
    },
  }),
  sendWinBack: defineEndpoint({
    method: "POST",
    path: `${GUESTS_PREFIX}/:id/win-back`,
    params: GuestIdParamsSchema,
    responses: {
      200: { description: "Win-back result", body: z.object({ data: WinBackResultSchema }) },
      401: problem(),
      404: problem(),
    },
  }),
  delete: defineEndpoint({
    method: "DELETE",
    path: `${GUESTS_PREFIX}/:id`,
    params: GuestIdParamsSchema,
    responses: {
      204: { description: "Guest deleted", body: null },
      404: guestNotFound,
      409: problem("Guest has reservations"),
    },
  }),
};
