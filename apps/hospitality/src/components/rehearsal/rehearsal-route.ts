import { z } from "zod";

export const REHEARSAL_PATH = "/rehearsal";

const rehearsalStateSchema = z.object({
  profile: z.enum(["friday", "weeknight"]),
  seed: z.number().int(),
  floorPlanId: z.string().optional(),
});

export type RehearsalNavState = z.infer<typeof rehearsalStateSchema>;
export type RehearsalNavProfile = RehearsalNavState["profile"];

/** Navigation state from the router, or null when it is absent or malformed. */
export function parseRehearsalState(value: unknown): RehearsalNavState | null {
  const parsed = rehearsalStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * The one impure step of a run: a seed from the clock. Called from click handlers only, never
 * from the simulator and never during render.
 */
export function freshSeed(): number {
  return Date.now() >>> 0;
}

export interface RehearsalNavigationInput {
  readonly profile: RehearsalNavProfile;
  readonly floorPlanId?: string;
  readonly replace?: boolean;
}

/** Arguments for `navigate(...)` that start a rehearsal with a fresh seed. */
export function rehearsalNavigation({
  profile,
  floorPlanId,
  replace,
}: RehearsalNavigationInput): readonly [string, { state: RehearsalNavState; replace?: boolean }] {
  const state: RehearsalNavState = {
    profile,
    seed: freshSeed(),
    ...(floorPlanId === undefined ? {} : { floorPlanId }),
  };
  return [REHEARSAL_PATH, replace ? { state, replace } : { state }];
}
