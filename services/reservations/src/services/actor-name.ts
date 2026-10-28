/** Longest display name stored on an audit row. */
const MAX_ACTOR_NAME_LENGTH = 120;

/**
 * The display name to snapshot on an availability audit row (History shows
 * "by <name>"). `null` when the token carries no usable name. A value with an
 * "@" is treated as an email and dropped: History must never expose one.
 */
export function actorNameOf(user: { name?: string | null } | undefined): string | null {
  const name = user?.name?.trim();
  if (!name || name.includes("@")) return null;
  return name.slice(0, MAX_ACTOR_NAME_LENGTH);
}
