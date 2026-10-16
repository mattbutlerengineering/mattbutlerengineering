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
  ERROR_UNAUTHORIZED,
  ERROR_CONFLICT,
  ERROR_FORBIDDEN,
} from "@mbe/test-fixtures";
