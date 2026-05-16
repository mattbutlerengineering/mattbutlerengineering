import type {
  User,
  UserPreferences,
  CreateUserRequest,
  UpdateUserRequest,
  UpdatePreferencesRequest,
  PaginatedResponse,
} from "@mbe/types";
import { prisma } from "./database.js";

function isPrismaNotFound(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "P2025"
  );
}

function mapPrismaUser(user: {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  emailVerified: boolean;
  preferences: unknown;
  createdAt: Date;
  updatedAt: Date;
}): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    emailVerified: user.emailVerified,
    preferences: (user.preferences as UserPreferences) ?? {},
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export const userService = {
  async list(page: number, limit: number): Promise<PaginatedResponse<User>> {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: users.map(mapPrismaUser),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  },

  async getById(id: string): Promise<User | null> {
    const user = await prisma.user.findUnique({ where: { id } });
    return user ? mapPrismaUser(user) : null;
  },

  async getByEmail(email: string): Promise<User | null> {
    const user = await prisma.user.findUnique({ where: { email } });
    return user ? mapPrismaUser(user) : null;
  },

  async create(data: CreateUserRequest): Promise<User> {
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name ?? null,
        picture: data.picture ?? null,
      },
    });
    return mapPrismaUser(user);
  },

  /**
   * Finds a user by email or creates one if not found.
   * Uses upsert to prevent race conditions when two concurrent
   * first-login requests arrive for the same email.
   */
  async findOrCreate(data: CreateUserRequest): Promise<User> {
    const user = await prisma.user.upsert({
      where: { email: data.email },
      update: {}, // No-op if user already exists
      create: {
        email: data.email,
        name: data.name ?? null,
        picture: data.picture ?? null,
      },
    });
    return mapPrismaUser(user);
  },

  async update(id: string, data: UpdateUserRequest): Promise<User | null> {
    try {
      const user = await prisma.user.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.picture !== undefined && { picture: data.picture }),
        },
      });
      return mapPrismaUser(user);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.user.delete({ where: { id } });
      return true;
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return false;
      throw err;
    }
  },

  async updatePreferences(id: string, preferences: UpdatePreferencesRequest): Promise<User | null> {
    try {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) return null;

      const currentPrefs = (user.preferences as UserPreferences) ?? {};
      const newPrefs = { ...currentPrefs, ...preferences };

      const updated = await prisma.user.update({
        where: { id },
        data: { preferences: newPrefs },
      });
      return mapPrismaUser(updated);
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },
};
