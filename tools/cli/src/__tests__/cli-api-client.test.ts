import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock config before importing the module under test
vi.mock("../config.js", () => ({
  getApiUrl: vi.fn(() => "http://localhost:3001"),
  getAccessToken: vi.fn(() => undefined),
}));

// Mock @mbe/api-client to capture how ApiClient is constructed
vi.mock("@mbe/api-client", () => ({
  ApiClient: vi.fn().mockImplementation(() => ({
    request: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    getOne: vi.fn(),
    postOne: vi.fn(),
    patchOne: vi.fn(),
  })),
}));

import { getApiUrl, getAccessToken } from "../config.js";
import { ApiClient } from "@mbe/api-client";
import { createCliApiClient, createAgentApiClient } from "../cli-api-client.js";

const mockGetApiUrl = vi.mocked(getApiUrl);
const mockGetAccessToken = vi.mocked(getAccessToken);
const MockApiClient = vi.mocked(ApiClient);

describe("createCliApiClient", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetApiUrl.mockReturnValue("http://localhost:3001");
    mockGetAccessToken.mockReturnValue(undefined);
    MockApiClient.mockClear();
  });

  it("creates ApiClient with base URL from config", () => {
    mockGetApiUrl.mockReturnValue("https://api.example.com");

    createCliApiClient();

    expect(MockApiClient).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://api.example.com" })
    );
  });

  it("passes getAccessToken callback that reads from config", async () => {
    mockGetAccessToken.mockReturnValue("test-token");

    createCliApiClient();

    const config = MockApiClient.mock.calls[0][0];
    const token = await config.getAccessToken?.();
    expect(token).toBe("test-token");
  });

  it("passes getAccessToken callback that returns null when no token", async () => {
    mockGetAccessToken.mockReturnValue(undefined);

    createCliApiClient();

    const config = MockApiClient.mock.calls[0][0];
    const token = await config.getAccessToken?.();
    expect(token).toBeNull();
  });

  it("disables retries (maxRetries: 0) for CLI use", () => {
    createCliApiClient();

    expect(MockApiClient).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
  });
});

describe("createAgentApiClient", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    MockApiClient.mockClear();
    delete process.env.AGENT_API_URL;
  });

  it("creates ApiClient with agent API URL from env", () => {
    process.env.AGENT_API_URL = "http://localhost:3003";

    createAgentApiClient();

    expect(MockApiClient).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "http://localhost:3003" })
    );
  });

  it("defaults to http://localhost:3003 when env is not set", () => {
    createAgentApiClient();

    expect(MockApiClient).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "http://localhost:3003" })
    );
  });

  it("does not pass a token callback (agent API is unauthenticated)", () => {
    createAgentApiClient();

    const config = MockApiClient.mock.calls[0][0];
    expect(config.getAccessToken).toBeUndefined();
  });

  it("disables retries (maxRetries: 0) for CLI use", () => {
    createAgentApiClient();

    expect(MockApiClient).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
  });
});
