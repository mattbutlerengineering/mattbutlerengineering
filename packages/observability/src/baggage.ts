import {
  propagation,
  context,
  type Baggage,
  type BaggageEntry,
} from "@opentelemetry/api";

export const BAGGAGE_KEYS = {
  SESSION_ID: "agent.session_id",
  PR_NUMBER: "agent.pr_number",
  ISSUE_NUMBER: "agent.issue_number",
  DEPLOY_SHA: "deploy.sha",
} as const;

export interface AgentBaggage {
  readonly sessionId?: string;
  readonly prNumber?: string;
  readonly issueNumber?: string;
  readonly deploySha?: string;
}

/**
 * Create a new context with agent baggage entries attached.
 *
 * Returns the enriched context — callers should use `context.with(ctx, fn)`
 * to execute code within the baggage scope. This ensures OTel's W3C Baggage
 * propagation attaches the entries to outbound HTTP headers automatically.
 */
export function createBaggageContext(bag: AgentBaggage): ReturnType<typeof context.active> {
  const entries: Record<string, BaggageEntry> = {};

  if (bag.sessionId) entries[BAGGAGE_KEYS.SESSION_ID] = { value: bag.sessionId };
  if (bag.prNumber) entries[BAGGAGE_KEYS.PR_NUMBER] = { value: bag.prNumber };
  if (bag.issueNumber) entries[BAGGAGE_KEYS.ISSUE_NUMBER] = { value: bag.issueNumber };
  if (bag.deploySha) entries[BAGGAGE_KEYS.DEPLOY_SHA] = { value: bag.deploySha };

  const baggageInstance: Baggage = propagation.createBaggage(entries);
  return propagation.setBaggage(context.active(), baggageInstance);
}

/**
 * Extract agent baggage from the current active context.
 */
export function extractAgentBaggage(): AgentBaggage {
  const bag = propagation.getBaggage(context.active());
  if (!bag) return {};

  return {
    sessionId: bag.getEntry(BAGGAGE_KEYS.SESSION_ID)?.value,
    prNumber: bag.getEntry(BAGGAGE_KEYS.PR_NUMBER)?.value,
    issueNumber: bag.getEntry(BAGGAGE_KEYS.ISSUE_NUMBER)?.value,
    deploySha: bag.getEntry(BAGGAGE_KEYS.DEPLOY_SHA)?.value,
  };
}
