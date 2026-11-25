import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFeedbackIssue, isFeedbackConfigured, FEEDBACK_TOKEN_ENV } from "./feedback-issue.js";

const INPUT = { title: "[Feedback] bug: x", body: "body", labels: ["feedback", "needs-triage"] };
const ENV = { [FEEDBACK_TOKEN_ENV]: "tok" };

const fetchMock = vi.fn<typeof fetch>();

function githubResponse(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("createFeedbackIssue", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts one authenticated request to the issues API and returns number and url", async () => {
    fetchMock.mockResolvedValue(
      githubResponse({ number: 77, html_url: "https://github.com/o/r/issues/77" })
    );

    const result = await createFeedbackIssue(INPUT, ENV);

    expect(result).toEqual({ number: 77, url: "https://github.com/o/r/issues/77" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://api.github.com/repos/mattbutlerengineering/mattbutlerengineering/issues"
    );
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["User-Agent"]).toBeTruthy();
    expect(JSON.parse(String(init?.body))).toEqual({
      title: INPUT.title,
      body: INPUT.body,
      labels: INPUT.labels,
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects without echoing upstream text on a non-2xx answer", async () => {
    fetchMock.mockResolvedValue(githubResponse({ message: "Bad credentials ghp_secret" }, 401));

    const err = await createFeedbackIssue(INPUT, ENV).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("401");
    expect((err as Error).message).not.toContain("ghp_secret");
  });

  it("rejects when the request times out", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));

    await expect(createFeedbackIssue(INPUT, ENV)).rejects.toThrow();
  });

  it("rejects an answer without an issue number or url", async () => {
    fetchMock.mockResolvedValue(githubResponse({ nope: true }));

    await expect(createFeedbackIssue(INPUT, ENV)).rejects.toThrow();
  });

  it("refuses without a token and never calls GitHub", async () => {
    await expect(createFeedbackIssue(INPUT, {})).rejects.toThrow(FEEDBACK_TOKEN_ENV);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("isFeedbackConfigured", () => {
  it("is false for a missing or blank token", () => {
    expect(isFeedbackConfigured({})).toBe(false);
    expect(isFeedbackConfigured({ [FEEDBACK_TOKEN_ENV]: "  " })).toBe(false);
    expect(isFeedbackConfigured({ [FEEDBACK_TOKEN_ENV]: "tok" })).toBe(true);
  });
});
