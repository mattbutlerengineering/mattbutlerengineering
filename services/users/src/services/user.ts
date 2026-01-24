import type { User, CreateUserRequest, UpdateUserRequest, PaginatedResponse } from "@mbe/types";
import { prisma } from "./database.js";

function mapPrismaUser(user: {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    emailVerified: user.emailVerified,
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
    } catch {
      return null;
    }
  },

  async delete(id: string): Promise<void> {
    try {
      await prisma.user.delete({ where: { id } });
    } catch {
      // User not found, no-op
    }
  },
};
