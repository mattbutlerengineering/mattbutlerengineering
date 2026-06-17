// Users domain
export { createMockUser, createMockPaginatedResponse } from "./users.js";
export type { MockUser, MockUserPreferences, MockPaginatedResponse } from "./users.js";

// Reservations domain
export {
  createMockTable,
  createMockReservation,
  createMockPagination,
  ERROR_NOT_FOUND,
  ERROR_UNAUTHORIZED,
  ERROR_CONFLICT,
  ERROR_FORBIDDEN,
} from "./reservations.js";
export type { MockTable, MockReservation, MockPagination } from "./reservations.js";

// JWT payload (defined once, shared across domains)
export { createMockJWTPayload } from "./jwt.js";
export type { MockJWTPayload } from "./jwt.js";
