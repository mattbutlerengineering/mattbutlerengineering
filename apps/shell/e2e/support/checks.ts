/** The spike's checks, by the ids the architecture's Spike record uses. */
export const CHECK_IDS = ["1", "2", "3", "3b", "3c", "4", "5", "6", "7", "8"] as const;

export type CheckId = (typeof CHECK_IDS)[number];
