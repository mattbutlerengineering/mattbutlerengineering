/**
 * Auth-flow machine — the pure model behind `/demos/auth-flow`.
 *
 * Encodes the OIDC authorization-code + PKCE flow (and its silent-refresh
 * encore) as ordered, declarative steps. The page renders FROM this data and
 * never invents motion of its own: which channel pulses, in which direction,
 * what each station's LED shows, and what the caption says all live here,
 * where tests can exercise them exhaustively without rendering anything.
 */

/** The three stations on the panel, in display order (start → end). */
export const STATIONS = ["browser", "idp", "api"] as const;
export type StationId = (typeof STATIONS)[number];

export type LedVariant = "neutral" | "accent" | "success" | "danger" | "warning" | "off";

/** The two connection channels a pulse can travel. */
export type ChannelId = "browser-idp" | "browser-api";

/** Direction of travel relative to the browser: outbound = away from it. */
export type Direction = "outbound" | "inbound";

/** What the pulse is carrying — makes protocol ordering testable structurally. */
export type Payload =
  "challenge" | "code" | "code-verifier" | "tokens" | "access-token" | "tampered-callback";

export interface FlowStep {
  id: string;
  /** Split-flap readout value (fits the alphanumeric charset). */
  readout: string;
  /** One-line plain-language explanation of the step. */
  caption: string;
  /** Channel the pulse travels this step, or null when nothing crosses the wire. */
  channel: ChannelId | null;
  /** Null exactly when `channel` is null. */
  direction: Direction | null;
  /** Null exactly when `channel` is null. */
  carries: Payload | null;
  /** Complete LED state for every station. */
  leds: Record<StationId, LedVariant>;
}

/** The happy path, in protocol order. */
export const HAPPY_PATH: readonly FlowStep[] = [
  {
    id: "authorize",
    readout: "AUTHORIZE",
    caption:
      "You click Sign in. Before anything leaves the browser, the SPA generates a random PKCE verifier and derives its SHA-256 challenge.",
    channel: null,
    direction: null,
    carries: null,
    leds: { browser: "accent", idp: "neutral", api: "neutral" },
  },
  {
    id: "redirect",
    readout: "REDIRECT",
    caption:
      "The browser redirects to the identity provider's authorize endpoint carrying the hashed challenge and a random state value — never the secret verifier.",
    channel: "browser-idp",
    direction: "outbound",
    carries: "challenge",
    leds: { browser: "accent", idp: "accent", api: "neutral" },
  },
  {
    id: "code",
    readout: "CODE",
    caption:
      "You authenticate at the provider. It redirects back with a single-use authorization code and echoes the state so the SPA can verify the callback.",
    channel: "browser-idp",
    direction: "inbound",
    carries: "code",
    leds: { browser: "accent", idp: "success", api: "neutral" },
  },
  {
    id: "exchange",
    readout: "EXCHANGE",
    caption:
      "The SPA posts the code and the original verifier to the token endpoint. The provider hashes the verifier and checks it against the challenge it saw earlier.",
    channel: "browser-idp",
    direction: "outbound",
    carries: "code-verifier",
    leds: { browser: "accent", idp: "accent", api: "neutral" },
  },
  {
    id: "tokens",
    readout: "TOKENS",
    caption:
      "Verifier confirmed — the provider issues an access token and a rotating refresh session. The one-time code is now spent.",
    channel: "browser-idp",
    direction: "inbound",
    carries: "tokens",
    leds: { browser: "success", idp: "success", api: "neutral" },
  },
  {
    id: "api-call",
    readout: "API CALL",
    caption:
      "The SPA calls the API with the access token as a Bearer credential. The API verifies the token's signature and audience before answering.",
    channel: "browser-api",
    direction: "outbound",
    carries: "access-token",
    leds: { browser: "success", idp: "neutral", api: "accent" },
  },
  {
    id: "refresh",
    readout: "REFRESH",
    caption:
      "Five minutes before the token expires, the SPA silently repeats the dance — a fresh challenge, a fresh one-time code, new tokens — with no interruption for you.",
    channel: "browser-idp",
    direction: "outbound",
    carries: "challenge",
    leds: { browser: "accent", idp: "accent", api: "success" },
  },
];

/** Index of the callback step the error branch replays with a tampered state. */
export const ERROR_FORK_INDEX = 2;

/** The rejected-callback step shown in place of the fork step. */
export const ERROR_STEP: FlowStep = {
  id: "state-mismatch",
  readout: "REJECTED",
  caption:
    "The callback's state parameter does not match the one the SPA sent, so the SPA rejects the redirect outright — the code is never exchanged. This check blocks CSRF and injected callbacks.",
  channel: "browser-idp",
  direction: "inbound",
  carries: "tampered-callback",
  leds: { browser: "danger", idp: "neutral", api: "neutral" },
};

export interface AuthFlowState {
  stepIndex: number;
  playing: boolean;
  errorBranch: boolean;
}

export const INITIAL_STATE: AuthFlowState = {
  stepIndex: 0,
  playing: false,
  errorBranch: false,
};

export type AuthFlowAction =
  | { type: "next" }
  | { type: "play" }
  | { type: "pause" }
  | { type: "reset" }
  | { type: "set-error-branch"; enabled: boolean };

/** Resolve the step the panel should show for a given state. */
export function currentStep(state: AuthFlowState): FlowStep {
  if (state.errorBranch && state.stepIndex === ERROR_FORK_INDEX) return ERROR_STEP;
  return HAPPY_PATH[state.stepIndex] ?? ERROR_STEP;
}

/** Pure reducer: always returns a new (or the same, unchanged) state object. */
export function advance(state: AuthFlowState, action: AuthFlowAction): AuthFlowState {
  switch (action.type) {
    case "next": {
      // A rejected callback halts the flow — only reset or toggling the
      // branch off moves things again.
      if (state.errorBranch && state.stepIndex === ERROR_FORK_INDEX) return state;
      const stepIndex = Math.min(state.stepIndex + 1, HAPPY_PATH.length - 1);
      return stepIndex === state.stepIndex ? state : { ...state, stepIndex };
    }
    case "play":
      return state.playing ? state : { ...state, playing: true };
    case "pause":
      return state.playing ? { ...state, playing: false } : state;
    case "reset":
      return INITIAL_STATE;
    case "set-error-branch":
      return action.enabled
        ? { stepIndex: ERROR_FORK_INDEX, playing: false, errorBranch: true }
        : { ...state, errorBranch: false };
  }
}
