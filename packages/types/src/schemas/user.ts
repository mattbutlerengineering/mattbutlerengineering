import { z } from "zod";

export const UserPreferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  emailNotifications: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
});

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  picture: z.string().nullable(),
  emailVerified: z.boolean(),
  preferences: UserPreferencesSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const UserProfileSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  picture: z.string().nullable(),
});
