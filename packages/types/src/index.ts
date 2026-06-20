// API types
export type {
  ApiResponse,
  ApiMeta,
  PaginatedResponse,
  Pagination,
  ApiError,
  HealthResponse,
  ReadinessResponse,
  ReadinessCheckStatus,
  HealthCheck,
  SystemStatus,
  SystemHealthResponse,
  SubsystemHealth,
  ServiceCheck,
  StaticSiteCheck,
  CiHealth,
  CiRunInfo,
  DeployHealth,
  DeployPipelineInfo,
  ProblemDetails,
} from "./api.js";
export { createProblemDetails } from "./api.js";

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
  DepositStatus,
  Deposit,
  Table,
  TableStatus,
  Reservation,
  Occasion,
  SeatingPreference,
  CreateReservationRequest,
  UpdateReservationRequest,
  CreateTableRequest,
  UpdateTableRequest,
  UpdateTableStatusRequest,
  WalkInRequest,
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
  DepositType,
  DepositConfig,
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
  GuestRiskScore,
  StaffNote,
  CommunicationPreference,
  CreateGuestRequest,
  UpdateGuestRequest,
  GuestSearchParams,
  GuestSegment,
  LapsingGuest,
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

// Date utilities
export { toDateString } from "./date.js";

// Zod Schemas
export * from "./schemas/index.js";
