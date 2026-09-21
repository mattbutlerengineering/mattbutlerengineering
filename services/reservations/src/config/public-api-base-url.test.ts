import { describe, it, expect, vi, afterEach } from "vitest";
import { getPublicApiBaseUrlConfig } from "./public-api-base-url.js";

describe("getPublicApiBaseUrlConfig", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the configured origin", () => {
    const config = getPublicApiBaseUrlConfig({
      baseUrl: "https://api.mattbutlerengineering.com",
      emailEnabled: true,
    });
    expect(config.baseUrl).toBe("https://api.mattbutlerengineering.com");
  });

  it("strips a trailing slash so the appended path cannot double up", () => {
    const config = getPublicApiBaseUrlConfig({
      baseUrl: "https://api.mattbutlerengineering.com/",
      emailEnabled: true,
    });
    expect(config.baseUrl).toBe("https://api.mattbutlerengineering.com");
  });

  // The root cause of #4517 was a production URL living only in a `??`
  // default, so an absent value must never resolve to a plausible-looking host.
  it("returns null rather than a default when the value is absent", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const config = getPublicApiBaseUrlConfig({ baseUrl: undefined, emailEnabled: true });
    expect(config.baseUrl).toBeNull();
  });

  it("returns null when the value is blank", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const config = getPublicApiBaseUrlConfig({ baseUrl: "   ", emailEnabled: true });
    expect(config.baseUrl).toBeNull();
  });

  it("logs loudly when the value is absent and email is actually enabled", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    getPublicApiBaseUrlConfig({ baseUrl: undefined, emailEnabled: true });
    expect(error).toHaveBeenCalledOnce();
    expect(String(error.mock.calls[0]?.[0])).toContain("PUBLIC_API_BASE_URL");
  });

  it("stays quiet when email is disabled, since nothing can send yet", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const config = getPublicApiBaseUrlConfig({ baseUrl: undefined, emailEnabled: false });
    expect(config.baseUrl).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  // Present-but-malformed is a deploy-time mistake that cannot be silently
  // right, and unlike absence it can only happen if someone set the variable.
  it("throws when the value has no scheme", () => {
    expect(() =>
      getPublicApiBaseUrlConfig({
        baseUrl: "api.mattbutlerengineering.com",
        emailEnabled: false,
      })
    ).toThrow(/PUBLIC_API_BASE_URL/);
  });

  it("throws when the scheme is not http or https", () => {
    expect(() =>
      getPublicApiBaseUrlConfig({ baseUrl: "javascript:alert(1)", emailEnabled: false })
    ).toThrow(/PUBLIC_API_BASE_URL/);
  });
});
