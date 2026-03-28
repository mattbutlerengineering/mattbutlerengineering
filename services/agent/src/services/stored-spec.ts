import type { Prisma, StoredSpec } from "../generated/prisma/index.js";
import { prisma } from "./database.js";

const CAP_UNFAVORITED = 100;

export interface StoredSpecResponse {
  id: string;
  userId: string;
  prompt: string;
  spec: unknown;
  rawLines: unknown;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export function mapStoredSpec(s: StoredSpec): StoredSpecResponse {
  return {
    id: s.id,
    userId: s.userId,
    prompt: s.prompt,
    spec: s.spec,
    rawLines: s.rawLines,
    isFavorite: s.isFavorite,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
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
    spec: unknown;
    rawLines: unknown;
  }): Promise<StoredSpec> {
    await _enforceCapForUser(data.userId);

    return prisma.storedSpec.create({
      data: {
        userId: data.userId,
        prompt: data.prompt,
        spec: data.spec as Prisma.InputJsonValue,
        rawLines: data.rawLines as Prisma.InputJsonValue,
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
