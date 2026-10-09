/**
 * Runtime role for reservations app transactions (ADR-026, #5369).
 *
 * `SET ROLE` cannot take a bind parameter, so the statement is built from
 * this constant only after it matches `^[a-z_]+$`. Callers pass no role name.
 */
export const APP_RESERVATIONS_ROLE = "app_reservations";

const APP_ROLE_PATTERN = /^[a-z_]+$/;

export interface AppRoleClient {
  $executeRawUnsafe: (query: string) => Promise<number>;
}

export function appRoleSetStatement(role: string = APP_RESERVATIONS_ROLE): string {
  if (!APP_ROLE_PATTERN.test(role)) {
    throw new Error(`refusing SET LOCAL ROLE for ${role}`);
  }
  return `SET LOCAL ROLE "${role}"`;
}

/**
 * First statement of an app transaction, including when no venue id is set.
 * `SET LOCAL` resets at commit or rollback. A missing role (`42704`) or a
 * missing grant (`42501`) must propagate — catching either and continuing
 * leaves the transaction as the table owner.
 */
export async function assumeAppRole(tx: AppRoleClient): Promise<void> {
  await tx.$executeRawUnsafe(appRoleSetStatement());
}
