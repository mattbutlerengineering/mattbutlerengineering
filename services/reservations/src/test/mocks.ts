/**
 * Re-exports from @mbe/test-fixtures for backwards compatibility.
 *
 * New tests should import directly from @mbe/test-fixtures.
 */

export {
  createMockTable,
  createMockReservation,
  createMockJWTPayload,
  createMockPagination,
  ERROR_NOT_FOUND,
  ERROR_UNAUTHORIZED,
  ERROR_CONFLICT,
  ERROR_FORBIDDEN,
} from "@mbe/test-fixtures";

export type {
  MockTable,
  MockReservation,
  MockJWTPayload,
  MockPagination,
} from "@mbe/test-fixtures";
