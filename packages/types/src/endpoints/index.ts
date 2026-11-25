export {
  defineEndpoint,
  problem,
  isProblemResponse,
  successResponse,
  type HttpMethod,
  type ProblemResponse,
  type BodyResponse,
  type EndpointResponse,
  type EndpointResponses,
  type EndpointDefinition,
  type AnyEndpointDefinition,
  type PathParamNames,
  type EndpointInput,
  type EndpointSuccess,
  type EndpointRouteGeneric,
} from "./define.js";
export { guestsEndpoints, GUESTS_PREFIX } from "./guests.js";
export { availabilityConfigEndpoints, AVAILABILITY_CONFIG_PREFIX } from "./availability-config.js";
export { holidayDecisionEndpoints } from "./holiday-decisions.js";
export {
  endOfServiceEndpoints,
  END_OF_SERVICE_PATH,
  EndOfServiceQuerySchema,
  EndOfServiceSummarySchema,
  type EndOfServiceSummary,
} from "./end-of-service.js";
export {
  autopilotProposalsEndpoints,
  AUTOPILOT_PROPOSALS_PATH,
  AutopilotProposalsQuerySchema,
  AutopilotMoveSchema,
  AutopilotProposalsSchema,
  type AutopilotMove,
  type AutopilotProposals,
} from "./autopilot.js";
export {
  lostDemandEndpoints,
  LOST_DEMAND_PATH,
  LostDemandQuerySchema,
  LostDemandSchema,
  LOST_DEMAND_WHAT_IF_PATH,
  LostDemandWhatIfQuerySchema,
  LostDemandWhatIfSchema,
  type LostDemandWhatIf,
  type LostDemand,
  type LostDemandCell,
} from "./lost-demand.js";
