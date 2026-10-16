import type {
  User,
  UserPreferences,
  CreateUserRequest,
  UpdateUserRequest,
  UpdatePreferencesRequest,
  PaginatedResponse,
} from "@mbe/types";
import { paginate, toPaginationMeta, isPrismaNotFound } from "@mbe/database";
import { prisma } from "./database.js";

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

interface RawUserRow {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  email_verified: boolean;
  preferences: unknown;
  created_at: Date;
  updated_at: Date;
}

export const userService = {
  async list(page: number, limit: number): Promise<PaginatedResponse<User>> {
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        ...paginate({ page, limit }),
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count(),
    ]);

    return {
      data: users.map(mapPrismaUser),
      pagination: toPaginationMeta(page, limit, total),
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

  /**
   * Merges the given preferences into the user identified by email in one
   * SQL statement (`jsonb ||` is a shallow merge), so concurrent writers with
   * different keys cannot erase each other. Returns null if no user has that
   * email.
   */
  async updatePreferencesByEmail(
    email: string,
    preferences: UpdatePreferencesRequest
  ): Promise<User | null> {
    try {
      const rows = await prisma.$queryRaw<RawUserRow[]>`
        UPDATE "users"
        SET "preferences" = "preferences" || ${JSON.stringify(preferences)}::jsonb,
            "updated_at" = now()
        WHERE "email" = ${email}
        RETURNING "id", "email", "name", "picture", "email_verified",
                  "preferences", "created_at", "updated_at"`;
      const row = rows[0];
      if (!row) return null;
      return mapPrismaUser({
        id: row.id,
        email: row.email,
        name: row.name,
        picture: row.picture,
        emailVerified: row.email_verified,
        preferences: row.preferences,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    } catch (err: unknown) {
      if (isPrismaNotFound(err)) return null;
      throw err;
    }
  },
};
