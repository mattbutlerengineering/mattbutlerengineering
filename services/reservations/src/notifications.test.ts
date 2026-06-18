import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Import lazily so we can control env vars before module evaluates
async function importNotifications() {
  return import("./notifications.js");
}

vi.mock("resend", () => {
  const ResendMock = vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    apiKey: string
  ) {
    this._apiKey = apiKey;
    this.emails = { send: vi.fn().mockResolvedValue({ id: "email-id-123" }) };
  });
  return { Resend: ResendMock };
});

vi.mock("@mbe/notifications", () => {
  const ResendNotificationAdapterMock = vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    config: unknown
  ) {
    this._config = config;
  });
  const TwilioSmsAdapterMock = vi.fn();
  const NotificationDispatcherMock = vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    deps: unknown
  ) {
    this._deps = deps;
  });
  return {
    ResendNotificationAdapter: ResendNotificationAdapterMock,
    TwilioSmsAdapter: TwilioSmsAdapterMock,
    NotificationDispatcher: NotificationDispatcherMock,
  };
});

describe("createResendAdapter", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);
  });

  it("returns a ResendNotificationAdapter when RESEND_API_KEY is set", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "test@example.com";
    process.env.MANAGE_BASE_URL = "https://example.com";

    const { createResendAdapter } = await importNotifications();
    const adapter = createResendAdapter();

    const { ResendNotificationAdapter } = await import("@mbe/notifications");
    expect(ResendNotificationAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        fromAddress: "test@example.com",
        manageBaseUrl: "https://example.com",
      })
    );
    expect(adapter).toBeDefined();
  });

  it("returns a ResendNotificationAdapter with null resend client when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_FROM = "noreply@example.com";
    process.env.MANAGE_BASE_URL = "https://example.com";

    const { createResendAdapter } = await importNotifications();
    const adapter = createResendAdapter();

    const { ResendNotificationAdapter } = await import("@mbe/notifications");
    expect(ResendNotificationAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        resend: null,
      })
    );
    expect(adapter).toBeDefined();
  });

  it("uses default values for EMAIL_FROM and MANAGE_BASE_URL when not set", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    delete process.env.MANAGE_BASE_URL;

    const { createResendAdapter } = await importNotifications();
    createResendAdapter();

    const { ResendNotificationAdapter } = await import("@mbe/notifications");
    expect(ResendNotificationAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        fromAddress: "reservations@mattbutlerengineering.com",
        manageBaseUrl: "https://mattbutlerengineering.com",
      })
    );
  });

  it("builds the Resend client with the API key when provided", async () => {
    process.env.RESEND_API_KEY = "re_live_secretkey";

    const { createResendAdapter } = await importNotifications();
    createResendAdapter();

    const { Resend } = await import("resend");
    expect(Resend).toHaveBeenCalledWith("re_live_secretkey");
  });
});

describe("createNotificationPort", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a NotificationDispatcher", async () => {
    const { createNotificationPort } = await importNotifications();
    const dispatcher = createNotificationPort();

    const { NotificationDispatcher } = await import("@mbe/notifications");
    expect(NotificationDispatcher).toHaveBeenCalled();
    expect(dispatcher).toBeDefined();
  });
});
