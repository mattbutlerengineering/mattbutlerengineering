/**
 * Re-exports from @mbe/test-fixtures for backwards compatibility.
 *
 * New tests should import directly from @mbe/test-fixtures.
 */

import { createMockJWTPayload } from "@mbe/test-fixtures";

// Backwards-compatible aliases
export { createMockUser as makeUser } from "@mbe/test-fixtures";
export { createMockPaginatedResponse as makePaginatedResponse } from "@mbe/test-fixtures";

// Constant aliases for tests that reference MOCK_JWT_PAYLOAD directly
export const MOCK_JWT_PAYLOAD = createMockJWTPayload();
// Routes guarded by requireAdmin / requireOwnershipOrAdmin need admin asked for explicitly.
export const ADMIN_JWT_PAYLOAD = createMockJWTPayload({ permissions: ["admin"] });
