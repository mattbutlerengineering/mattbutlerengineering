/**
 * Re-exports from @mbe/test-fixtures for backwards compatibility.
 *
 * New tests should import directly from @mbe/test-fixtures.
 */

import { createMockUser, createMockJWTPayload } from "@mbe/test-fixtures";

export {
  createMockUser,
  createMockPaginatedResponse,
  createMockJWTPayload,
} from "@mbe/test-fixtures";

export type { MockUser, MockJWTPayload } from "@mbe/test-fixtures";

// Backwards-compatible aliases
export { createMockUser as makeUser } from "@mbe/test-fixtures";
export { createMockPaginatedResponse as makePaginatedResponse } from "@mbe/test-fixtures";

// Constant aliases for tests that reference MOCK_USER / MOCK_JWT_PAYLOAD directly
export const MOCK_USER = createMockUser();
export const MOCK_JWT_PAYLOAD = createMockJWTPayload();
