/**
 * Pure identity-resolution helpers for the guest domain.
 *
 * - `applyDietaryRestrictions` — union merge (existing ∪ incoming), update-only-when-new
 * - `buildGuestUpdateData` — compute the Prisma update payload for an existing guest
 *
 * Both functions are pure: they work over pre-fetched data and never touch the database.
 */
import type { Prisma } from "../generated/prisma/index.js";

type GuestSnapshot = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  dietaryRestrictions: string[] | null;
};

type IncomingGuestData = {
  name: string;
  email?: string;
  phone?: string;
  dietaryRestrictions?: string[];
};

/**
 * Compute the union of two dietary-restriction arrays, preserving order and deduplicating.
 * Returns null when the union is empty.
 */
export function applyDietaryRestrictions(
  existing: string[] | null | undefined,
  incoming: string[] | null | undefined
): string[] | null {
  const existingArr = existing ?? [];
  const incomingArr = incoming ?? [];
  if (existingArr.length === 0 && incomingArr.length === 0) return null;
  const merged = [...existingArr];
  for (const item of incomingArr) {
    if (!merged.includes(item)) {
      merged.push(item);
    }
  }
  return merged.length > 0 ? merged : null;
}

/**
 * Compute the Prisma update payload for an existing guest given incoming booking data.
 * Returns an empty object when no fields need updating (caller should skip the DB write).
 */
export function buildGuestUpdateData(
  existing: GuestSnapshot,
  incoming: IncomingGuestData
): Prisma.GuestUpdateInput {
  const updateData: Prisma.GuestUpdateInput = {};

  if (existing.name !== incoming.name) {
    updateData.name = incoming.name;
  }

  if (incoming.email !== undefined && existing.email !== incoming.email) {
    updateData.email = incoming.email;
  }

  if (incoming.phone !== undefined && existing.phone !== incoming.phone) {
    updateData.phone = incoming.phone;
  }

  if (incoming.dietaryRestrictions && incoming.dietaryRestrictions.length > 0) {
    const existingDietary = existing.dietaryRestrictions;
    const merged = applyDietaryRestrictions(existingDietary, incoming.dietaryRestrictions);
    const hasNewRestrictions =
      merged !== null &&
      (existingDietary === null ||
        merged.length > existingDietary.length ||
        merged.some((r) => !existingDietary.includes(r)));
    if (hasNewRestrictions) {
      updateData.dietaryRestrictions = merged as Prisma.InputJsonValue;
    }
  }

  return updateData;
}
