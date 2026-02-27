// API types
export type {
  ApiResponse,
  ApiMeta,
  PaginatedResponse,
  Pagination,
  ApiError,
  HealthResponse,
  HealthCheck,
} from "./api.js";

// User types
export type {
  User,
  UserProfile,
  UserPreferences,
  CreateUserRequest,
  UpdateUserRequest,
  UpdatePreferencesRequest,
} from "./user.js";

// Reservation types
export type {
  ReservationStatus,
  Table,
  Reservation,
  CreateReservationRequest,
  UpdateReservationRequest,
  CreateTableRequest,
  UpdateTableRequest,
} from "./reservation.js";

// Venue types
export type {
  VenueGroup,
  Venue,
  OperatingHours,
  DaySchedule,
  VenueSettings,
  PacingRule,
  DurationRule,
  CreateVenueGroupRequest,
  UpdateVenueGroupRequest,
  CreateVenueRequest,
  UpdateVenueRequest,
} from "./venue.js";

// Availability types
export type {
  TimeSlot,
  AvailableTable,
  DateAvailability,
  AvailabilityQuery,
  DateRangeQuery,
  ReservationHold,
  CreateHoldRequest,
  ConfirmHoldRequest,
  ConflictCheckResult,
  PacingCheckResult,
} from "./availability.js";

// Guest types
export type {
  Guest,
  CreateGuestRequest,
  UpdateGuestRequest,
  GuestSearchParams,
  GuestSegment,
} from "./guest.js";

// Agent types
export type {
  AgentSessionStatus,
  AgentSession,
  CreateAgentSessionRequest,
  AgentSessionEvent,
} from "./agent.js";

// Floor plan types
export type {
  FloorPlan,
  FloorPlanLayout,
  TableShapeMetadata,
  CreateFloorPlanRequest,
  UpdateFloorPlanRequest,
  UpdateTablePositionRequest,
  BulkUpdateTablePositionsRequest,
} from "./floor-plan.js";
