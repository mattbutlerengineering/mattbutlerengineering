import { describe, it, expect } from "vitest";
import {
  HAPPY_PATH,
  ERROR_STEP,
  ERROR_FORK_INDEX,
  HANDSHAKE_STATIONS,
  INITIAL_STATE,
  STATIONS,
  advance,
  currentStep,
  handshakeFor,
  type AuthFlowState,
  type FlowStep,
} from "./authFlowMachine.js";

const VALID_LEDS = ["neutral", "accent", "success", "danger", "warning", "off"];
const VALID_CHANNELS = ["browser-idp", "browser-api"];
const VALID_DIRECTIONS = ["outbound", "inbound"];

const ALL_STEPS: readonly FlowStep[] = [...HAPPY_PATH, ERROR_STEP];

describe("authFlowMachine steps", () => {
  it("walks the documented readout sequence in order", () => {
    expect(HAPPY_PATH.map((s) => s.readout)).toEqual([
      "AUTHORIZE",
      "REDIRECT",
      "CODE",
      "EXCHANGE",
      "TOKENS",
      "API CALL",
      "REFRESH",
    ]);
  });

  it("has globally unique step ids (including the error step)", () => {
    const ids = ALL_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every step has a complete LED map over exactly the three stations", () => {
    for (const step of ALL_STEPS) {
      expect(Object.keys(step.leds).sort()).toEqual([...STATIONS].sort());
      for (const variant of Object.values(step.leds)) {
        expect(VALID_LEDS).toContain(variant);
      }
    }
  });

  it("channel, direction, and payload are all present or all absent — at most one active channel", () => {
    for (const step of ALL_STEPS) {
      if (step.channel === null) {
        expect(step.direction).toBeNull();
        expect(step.carries).toBeNull();
      } else {
        expect(VALID_CHANNELS).toContain(step.channel);
        expect(VALID_DIRECTIONS).toContain(step.direction);
        expect(step.carries).not.toBeNull();
      }
    }
  });

  it("every step has a non-empty plain-language caption", () => {
    for (const step of ALL_STEPS) {
      expect(step.caption.length).toBeGreaterThan(20);
    }
  });

  it("PKCE ordering: challenge travels out before the code comes back, verifier only at exchange", () => {
    const challengeIdx = HAPPY_PATH.findIndex((s) => s.carries === "challenge");
    const codeIdx = HAPPY_PATH.findIndex((s) => s.carries === "code");
    const exchangeIdx = HAPPY_PATH.findIndex((s) => s.carries === "code-verifier");

    expect(challengeIdx).toBeGreaterThanOrEqual(0);
    expect(challengeIdx).toBeLessThan(codeIdx);
    expect(codeIdx).toBeLessThan(exchangeIdx);

    // The verifier travels exactly once, at the exchange step, toward the IdP.
    expect(HAPPY_PATH.filter((s) => s.carries === "code-verifier")).toHaveLength(1);
    const exchange = HAPPY_PATH[exchangeIdx];
    expect(exchange?.id).toBe("exchange");
    expect(exchange?.direction).toBe("outbound");
    expect(exchange?.channel).toBe("browser-idp");
  });

  it("the challenge goes outbound and the code comes inbound on the IdP channel", () => {
    const challenge = HAPPY_PATH.find((s) => s.carries === "challenge");
    const code = HAPPY_PATH.find((s) => s.carries === "code");
    expect(challenge?.direction).toBe("outbound");
    expect(challenge?.channel).toBe("browser-idp");
    expect(code?.direction).toBe("inbound");
    expect(code?.channel).toBe("browser-idp");
  });

  it("the API call carries the access token outbound on the API channel", () => {
    const apiCall = HAPPY_PATH.find((s) => s.carries === "access-token");
    expect(apiCall?.channel).toBe("browser-api");
    expect(apiCall?.direction).toBe("outbound");
  });

  it("the error branch forks at the callback step (the one carrying the code)", () => {
    expect(HAPPY_PATH[ERROR_FORK_INDEX]?.carries).toBe("code");
  });

  it("the error step rejects the tampered callback at the browser", () => {
    expect(ERROR_STEP.leds.browser).toBe("danger");
    expect(ERROR_STEP.carries).toBe("tampered-callback");
    expect(ERROR_STEP.direction).toBe("inbound");
    expect(ERROR_STEP.readout).toBe("REJECTED");
    expect(ERROR_STEP.caption).toMatch(/state/i);
  });
});

describe("advance reducer", () => {
  it("next advances one step at a time through the happy path", () => {
    let state = INITIAL_STATE;
    for (let i = 1; i < HAPPY_PATH.length; i++) {
      state = advance(state, { type: "next" });
      expect(state.stepIndex).toBe(i);
    }
  });

  it("next clamps at the final step instead of wrapping", () => {
    const last: AuthFlowState = { ...INITIAL_STATE, stepIndex: HAPPY_PATH.length - 1 };
    expect(advance(last, { type: "next" }).stepIndex).toBe(HAPPY_PATH.length - 1);
  });

  it("next is blocked while the error branch shows the rejected callback", () => {
    const halted: AuthFlowState = {
      stepIndex: ERROR_FORK_INDEX,
      playing: false,
      errorBranch: true,
    };
    expect(advance(halted, { type: "next" }).stepIndex).toBe(ERROR_FORK_INDEX);
  });

  it("enabling the error branch replays the callback step, paused", () => {
    const midFlow: AuthFlowState = { stepIndex: 5, playing: true, errorBranch: false };
    const next = advance(midFlow, { type: "set-error-branch", enabled: true });
    expect(next).toEqual({ stepIndex: ERROR_FORK_INDEX, playing: false, errorBranch: true });
  });

  it("disabling the error branch stays on the callback step in the happy path", () => {
    const halted: AuthFlowState = {
      stepIndex: ERROR_FORK_INDEX,
      playing: false,
      errorBranch: true,
    };
    const next = advance(halted, { type: "set-error-branch", enabled: false });
    expect(next.errorBranch).toBe(false);
    expect(next.stepIndex).toBe(ERROR_FORK_INDEX);
  });

  it("play and pause flip only the playing flag", () => {
    const playing = advance(INITIAL_STATE, { type: "play" });
    expect(playing).toEqual({ ...INITIAL_STATE, playing: true });
    expect(advance(playing, { type: "pause" })).toEqual({ ...INITIAL_STATE, playing: false });
  });

  it("reset returns the initial state from anywhere", () => {
    const deep: AuthFlowState = { stepIndex: 6, playing: true, errorBranch: true };
    expect(advance(deep, { type: "reset" })).toEqual(INITIAL_STATE);
  });

  it("is pure: never mutates its input and is deterministic", () => {
    const input: AuthFlowState = Object.freeze({ stepIndex: 1, playing: true, errorBranch: false });
    const snapshot = { ...input };

    const a = advance(input, { type: "next" });
    const b = advance(input, { type: "next" });

    expect(input).toEqual(snapshot);
    expect(a).toEqual(b);
    expect(a).not.toBe(input);
  });
});

describe("handshakeFor", () => {
  const EXPECTED: Record<string, ReturnType<typeof handshakeFor>> = {
    authorize: { state: "idle", lane: 0 },
    redirect: { state: "negotiating", lane: 0 },
    code: { state: "negotiating", lane: 0 },
    exchange: { state: "negotiating", lane: 0 },
    tokens: { state: "negotiating", lane: 0 },
    "api-call": { state: "negotiating", lane: 1 },
    refresh: { state: "negotiating", lane: 0 },
    "state-mismatch": { state: "failed", lane: 0 },
  };

  it.each(ALL_STEPS)("projects step $id per the contract", (step) => {
    expect(handshakeFor(step)).toEqual(EXPECTED[step.id]);
  });

  it("HANDSHAKE_STATIONS is Identity, Browser, API in hub order", () => {
    expect(HANDSHAKE_STATIONS).toEqual(["Identity", "Browser", "API"]);
  });
});

describe("currentStep", () => {
  it("resolves the happy-path step for the current index", () => {
    expect(currentStep(INITIAL_STATE)).toBe(HAPPY_PATH[0]);
    expect(currentStep({ stepIndex: 4, playing: false, errorBranch: false })).toBe(HAPPY_PATH[4]);
  });

  it("substitutes the error step only at the fork index while the branch is on", () => {
    expect(currentStep({ stepIndex: ERROR_FORK_INDEX, playing: false, errorBranch: true })).toBe(
      ERROR_STEP
    );
    expect(currentStep({ stepIndex: 0, playing: false, errorBranch: true })).toBe(HAPPY_PATH[0]);
  });
});
