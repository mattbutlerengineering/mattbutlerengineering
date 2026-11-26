import type { Prisma, PrismaClient } from "../generated/prisma/index.js";
import { prisma } from "./database.js";

/** Prisma's unique-constraint violation code. */
const UNIQUE_VIOLATION = "P2002";

/** Raised when a confirm nonce was already used: a replayed confirm must not run twice. */
export class DuplicateConfirmNonceError extends Error {
  constructor() {
    super("This confirmation was already used.");
    this.name = "DuplicateConfirmNonceError";
  }
}

/** One write made with a write-scoped personal access token (#9780). */
export interface AccessTokenWriteAuditEntry {
  readonly tokenId: string;
  readonly userSub: string;
  readonly method: string;
  /** The route pattern, never the raw URL. */
  readonly route: string;
  /** Informational: resolved from the request when it names a venue, else `null`. */
  readonly venueId: string | null;
  /** The parsed params and body, as sent. May hold guest notes: never logged. */
  readonly input: Prisma.InputJsonValue;
  readonly tool: string | null;
  readonly confirmNonce: string | null;
}

export function createAccessTokenAuditService(client: PrismaClient = prisma) {
  return {
    /** Inserts the row and returns its id; throws `DuplicateConfirmNonceError` on a reused nonce. */
    async record(entry: AccessTokenWriteAuditEntry): Promise<string> {
      try {
        const row = await client.accessTokenWriteAudit.create({
          data: entry,
          select: { id: true },
        });
        return row.id;
      } catch (error) {
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
          throw new DuplicateConfirmNonceError();
        }
        throw error;
      }
    },

    /** Stamps the final response status once the handler has answered. */
    async recordStatus(id: string, statusCode: number): Promise<void> {
      await client.accessTokenWriteAudit.updateMany({
        where: { id },
        data: { statusCode },
      });
    },
  };
}

export const accessTokenAuditService = createAccessTokenAuditService();
