import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so variables are available inside the vi.mock factory (which is hoisted)
const { mockSetBaggage, mockGetBaggage, mockCreateBaggage, mockContextActive } = vi.hoisted(
  () => ({
    mockSetBaggage: vi.fn(),
    mockGetBaggage: vi.fn(),
    mockCreateBaggage: vi.fn(),
    mockContextActive: vi.fn(),
  }),
);

vi.mock("@opentelemetry/api", () => {
  return {
    propagation: {
      createBaggage: mockCreateBaggage,
      setBaggage: mockSetBaggage,
      getBaggage: mockGetBaggage,
    },
    context: {
      active: mockContextActive,
    },
  };
});

import {
  createBaggageContext,
  extractAgentBaggage,
  BAGGAGE_KEYS,
} from "./baggage.js";

describe("BAGGAGE_KEYS", () => {
  it("exposes expected key constants", () => {
    expect(BAGGAGE_KEYS.SESSION_ID).toBe("agent.session_id");
    expect(BAGGAGE_KEYS.PR_NUMBER).toBe("agent.pr_number");
    expect(BAGGAGE_KEYS.ISSUE_NUMBER).toBe("agent.issue_number");
    expect(BAGGAGE_KEYS.DEPLOY_SHA).toBe("deploy.sha");
  });
});

describe("createBaggageContext", () => {
  const fakeActiveContext = Symbol("active-ctx");
  const fakeBaggageInstance = Symbol("baggage-instance");
  const fakeEnrichedContext = Symbol("enriched-ctx");

  beforeEach(() => {
    vi.clearAllMocks();
    mockContextActive.mockReturnValue(fakeActiveContext);
    mockCreateBaggage.mockReturnValue(fakeBaggageInstance);
    mockSetBaggage.mockReturnValue(fakeEnrichedContext);
  });

  it("returns the enriched context from propagation.setBaggage", () => {
    const result = createBaggageContext({ sessionId: "abc" });
    expect(result).toBe(fakeEnrichedContext);
  });

  it("calls propagation.createBaggage with sessionId entry", () => {
    createBaggageContext({ sessionId: "sess-123" });

    expect(mockCreateBaggage).toHaveBeenCalledWith(
      expect.objectContaining({
        [BAGGAGE_KEYS.SESSION_ID]: { value: "sess-123" },
      }),
    );
  });

  it("calls propagation.createBaggage with prNumber entry", () => {
    createBaggageContext({ prNumber: "42" });

    expect(mockCreateBaggage).toHaveBeenCalledWith(
      expect.objectContaining({
        [BAGGAGE_KEYS.PR_NUMBER]: { value: "42" },
      }),
    );
  });

  it("calls propagation.createBaggage with issueNumber entry", () => {
    createBaggageContext({ issueNumber: "99" });

    expect(mockCreateBaggage).toHaveBeenCalledWith(
      expect.objectContaining({
        [BAGGAGE_KEYS.ISSUE_NUMBER]: { value: "99" },
      }),
    );
  });

  it("calls propagation.createBaggage with deploySha entry", () => {
    createBaggageContext({ deploySha: "deadbeef" });

    expect(mockCreateBaggage).toHaveBeenCalledWith(
      expect.objectContaining({
        [BAGGAGE_KEYS.DEPLOY_SHA]: { value: "deadbeef" },
      }),
    );
  });

  it("includes all fields when all are provided", () => {
    createBaggageContext({
      sessionId: "s1",
      prNumber: "10",
      issueNumber: "20",
      deploySha: "abc123",
    });

    expect(mockCreateBaggage).toHaveBeenCalledWith({
      [BAGGAGE_KEYS.SESSION_ID]: { value: "s1" },
      [BAGGAGE_KEYS.PR_NUMBER]: { value: "10" },
      [BAGGAGE_KEYS.ISSUE_NUMBER]: { value: "20" },
      [BAGGAGE_KEYS.DEPLOY_SHA]: { value: "abc123" },
    });
  });

  it("omits undefined fields from baggage entries", () => {
    createBaggageContext({ sessionId: "s1" });

    const calledWith = mockCreateBaggage.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(calledWith)).toEqual([BAGGAGE_KEYS.SESSION_ID]);
  });

  it("creates empty baggage when bag is empty", () => {
    createBaggageContext({});

    expect(mockCreateBaggage).toHaveBeenCalledWith({});
  });

  it("calls setBaggage with active context and the baggage instance", () => {
    createBaggageContext({ sessionId: "s1" });

    expect(mockSetBaggage).toHaveBeenCalledWith(fakeActiveContext, fakeBaggageInstance);
  });
});

describe("extractAgentBaggage", () => {
  const fakeActiveContext = Symbol("active-ctx");

  beforeEach(() => {
    vi.clearAllMocks();
    mockContextActive.mockReturnValue(fakeActiveContext);
  });

  it("returns empty object when no baggage in context", () => {
    mockGetBaggage.mockReturnValue(null);

    const result = extractAgentBaggage();
    expect(result).toEqual({});
  });

  it("returns empty object when baggage is undefined", () => {
    mockGetBaggage.mockReturnValue(undefined);

    const result = extractAgentBaggage();
    expect(result).toEqual({});
  });

  it("extracts sessionId from baggage", () => {
    const mockBaggage = {
      getEntry: vi.fn((key: string) => {
        if (key === BAGGAGE_KEYS.SESSION_ID) return { value: "session-xyz" };
        return undefined;
      }),
    };
    mockGetBaggage.mockReturnValue(mockBaggage);

    const result = extractAgentBaggage();
    expect(result.sessionId).toBe("session-xyz");
  });

  it("extracts prNumber from baggage", () => {
    const mockBaggage = {
      getEntry: vi.fn((key: string) => {
        if (key === BAGGAGE_KEYS.PR_NUMBER) return { value: "55" };
        return undefined;
      }),
    };
    mockGetBaggage.mockReturnValue(mockBaggage);

    const result = extractAgentBaggage();
    expect(result.prNumber).toBe("55");
  });

  it("extracts issueNumber from baggage", () => {
    const mockBaggage = {
      getEntry: vi.fn((key: string) => {
        if (key === BAGGAGE_KEYS.ISSUE_NUMBER) return { value: "100" };
        return undefined;
      }),
    };
    mockGetBaggage.mockReturnValue(mockBaggage);

    const result = extractAgentBaggage();
    expect(result.issueNumber).toBe("100");
  });

  it("extracts deploySha from baggage", () => {
    const mockBaggage = {
      getEntry: vi.fn((key: string) => {
        if (key === BAGGAGE_KEYS.DEPLOY_SHA) return { value: "sha-abc" };
        return undefined;
      }),
    };
    mockGetBaggage.mockReturnValue(mockBaggage);

    const result = extractAgentBaggage();
    expect(result.deploySha).toBe("sha-abc");
  });

  it("extracts all fields when all are present", () => {
    const entries: Record<string, { value: string }> = {
      [BAGGAGE_KEYS.SESSION_ID]: { value: "s1" },
      [BAGGAGE_KEYS.PR_NUMBER]: { value: "10" },
      [BAGGAGE_KEYS.ISSUE_NUMBER]: { value: "20" },
      [BAGGAGE_KEYS.DEPLOY_SHA]: { value: "sha999" },
    };
    const mockBaggage = {
      getEntry: vi.fn((key: string) => entries[key]),
    };
    mockGetBaggage.mockReturnValue(mockBaggage);

    const result = extractAgentBaggage();
    expect(result).toEqual({
      sessionId: "s1",
      prNumber: "10",
      issueNumber: "20",
      deploySha: "sha999",
    });
  });

  it("returns undefined fields when baggage entries are absent", () => {
    const mockBaggage = {
      getEntry: vi.fn(() => undefined),
    };
    mockGetBaggage.mockReturnValue(mockBaggage);

    const result = extractAgentBaggage();
    expect(result.sessionId).toBeUndefined();
    expect(result.prNumber).toBeUndefined();
    expect(result.issueNumber).toBeUndefined();
    expect(result.deploySha).toBeUndefined();
  });

  it("calls getBaggage with active context", () => {
    mockGetBaggage.mockReturnValue(null);
    extractAgentBaggage();

    expect(mockGetBaggage).toHaveBeenCalledWith(fakeActiveContext);
  });
});
