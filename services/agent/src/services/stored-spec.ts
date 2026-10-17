import type { Prisma, StoredSpec } from "../generated/prisma/index.js";
import { prisma } from "./database.js";

const CAP_UNFAVORITED = 100;

export interface SpecRefinement {
  parentId: string | null;
  path: string;
  before: unknown;
  after: unknown;
}

export interface StoredSpecResponse {
  id: string;
  userId: string;
  prompt: string;
  kind: string;
  spec: unknown;
  rawLines: unknown;
  isFavorite: boolean;
  refinement: unknown;
  createdAt: string;
  updatedAt: string;
}

export type StoredSpecPublicResponse = Omit<StoredSpecResponse, "userId">;

export function mapStoredSpec(s: StoredSpec): StoredSpecResponse {
  return {
    id: s.id,
    userId: s.userId,
    prompt: s.prompt,
    kind: s.kind,
    spec: s.spec,
    rawLines: s.rawLines,
    isFavorite: s.isFavorite,
    refinement: s.refinement ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

// PUBLIC — omits userId. Use for endpoints reachable without auth (e.g. the
// spec permalink viewer), which have no legitimate use for the owner's
// internal user id.
export function mapStoredSpecPublic(s: StoredSpec): StoredSpecPublicResponse {
  const { userId: _userId, ...rest } = mapStoredSpec(s);
  return rest;
}

async function _enforceCapForUser(userId: string): Promise<void> {
  const unfavoritedCount = await prisma.storedSpec.count({
    where: { userId, isFavorite: false },
  });

  if (unfavoritedCount >= CAP_UNFAVORITED) {
    const oldest = await prisma.storedSpec.findFirst({
      where: { userId, isFavorite: false },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (oldest) {
      await prisma.storedSpec.delete({ where: { id: oldest.id } });
    }
  }
}

export const storedSpecService = {
  async list(userId: string): Promise<StoredSpec[]> {
    return prisma.storedSpec.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  },

  async getById(id: string): Promise<StoredSpec | null> {
    return prisma.storedSpec.findUnique({ where: { id } });
  },

  async create(data: {
    userId: string;
    prompt: string;
    kind: string;
    spec: unknown;
    rawLines: unknown;
    refinement?: SpecRefinement;
  }): Promise<StoredSpec> {
    const parentId = data.refinement?.parentId;
    if (parentId) {
      const parent = await prisma.storedSpec.findUnique({ where: { id: parentId } });
      if (!parent || parent.userId !== data.userId) {
        throw new Error("Not found");
      }
    }

    await _enforceCapForUser(data.userId);

    return prisma.storedSpec.create({
      data: {
        userId: data.userId,
        prompt: data.prompt,
        kind: data.kind,
        spec: data.spec as Prisma.InputJsonValue,
        rawLines: data.rawLines as Prisma.InputJsonValue,
        ...(data.refinement && { refinement: data.refinement as unknown as Prisma.InputJsonValue }),
      },
    });
  },

  async toggleFavorite(id: string, userId: string): Promise<StoredSpec> {
    const existing = await prisma.storedSpec.findUnique({ where: { id } });

    if (!existing || existing.userId !== userId) {
      throw new Error("Not found");
    }

    return prisma.storedSpec.update({
      where: { id },
      data: { isFavorite: !existing.isFavorite },
    });
  },

  async delete(id: string, userId: string): Promise<void> {
    const existing = await prisma.storedSpec.findUnique({ where: { id } });

    if (!existing || existing.userId !== userId) {
      throw new Error("Not found");
    }

    await prisma.storedSpec.delete({ where: { id } });
  },

  _enforceCapForUser,
};
