export { initTelemetry } from "./sdk.js";
export type { OtelConfig } from "./sdk.js";

export {
  createBaggageContext,
  extractAgentBaggage,
  BAGGAGE_KEYS,
} from "./baggage.js";
export type { AgentBaggage } from "./baggage.js";
