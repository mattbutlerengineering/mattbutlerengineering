import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Module-level send mock — captured at factory time so all test groups see it ───

const sendEmailMock = vi.fn().mockResolvedValue({ id: "email-id-123" });

vi.mock("resend", () => {
  const ResendMock = vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    apiKey: string
  ) {
    this._apiKey = apiKey;
    this.emails = { send: sendEmailMock };
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

// Import lazily so we can control env vars before module evaluates
async function importNotifications() {
  return import("./notifications.js");
}

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

// ─── Security: sendThankYouEmail HTML injection prevention ────────────────────

describe("sendThankYouEmail — HTML injection prevention", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    sendEmailMock.mockClear();
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "from@example.com";
    process.env.MANAGE_BASE_URL = "https://example.com";
  });

  afterEach(() => {
    Object.keys(process.env).forEach((key) => {
      if (!(key in originalEnv)) delete process.env[key];
    });
    Object.assign(process.env, originalEnv);
  });

  async function captureHtml(input: Record<string, unknown>): Promise<string> {
    const { sendThankYouEmail } = await importNotifications();
    await sendThankYouEmail(input as unknown as Parameters<typeof sendThankYouEmail>[0]);
    const calls = sendEmailMock.mock.calls as Array<[{ html: string }]>;
    if (calls.length === 0) throw new Error("sendEmailMock was not called");
    return calls[calls.length - 1][0].html;
  }

  it("rejects a javascript: feedbackUrl and omits the feedback section", async () => {
    const html = await captureHtml({
      guestEmail: "g@example.com",
      guestFirstName: "Alice",
      venueName: "Cafe",
      visitDate: "2026-06-15",
      feedbackUrl: "javascript:alert(1)",
      unsubscribeToken: "tok",
    });

    expect(html).not.toContain("javascript:alert(1)");
    expect(html).not.toContain("Share your feedback");
  });

  it("rejects a data: feedbackUrl and omits the feedback section", async () => {
    const html = await captureHtml({
      guestEmail: "g@example.com",
      guestFirstName: "Alice",
      venueName: "Cafe",
      visitDate: "2026-06-15",
      feedbackUrl: "data:text/html,<script>alert(1)</script>",
      unsubscribeToken: "tok",
    });

    expect(html).not.toContain("data:text/html");
    expect(html).not.toContain("Share your feedback");
  });

  it("rejects a feedbackUrl with HTML-injection payload and does not emit raw script tag", async () => {
    const html = await captureHtml({
      guestEmail: "g@example.com",
      guestFirstName: "Alice",
      venueName: "Cafe",
      visitDate: "2026-06-15",
      feedbackUrl: '"><script>alert(1)</script>',
      unsubscribeToken: "tok",
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain('"><script>alert(1)</script>');
  });

  it("includes feedback link for a safe https feedbackUrl", async () => {
    const html = await captureHtml({
      guestEmail: "g@example.com",
      guestFirstName: "Alice",
      venueName: "Cafe",
      visitDate: "2026-06-15",
      feedbackUrl: "https://feedback.example.com/survey?id=1",
      unsubscribeToken: "tok",
    });

    expect(html).toContain("Share your feedback");
    expect(html).toContain("https://feedback.example.com/survey?id=1");
  });

  it("includes feedback link for a safe http feedbackUrl", async () => {
    const html = await captureHtml({
      guestEmail: "g@example.com",
      guestFirstName: "Alice",
      venueName: "Cafe",
      visitDate: "2026-06-15",
      feedbackUrl: "http://feedback.example.com/survey",
      unsubscribeToken: "tok",
    });

    expect(html).toContain("Share your feedback");
    expect(html).toContain("http://feedback.example.com/survey");
  });

  it("HTML-escapes venueName containing angle brackets", async () => {
    const html = await captureHtml({
      guestEmail: "g@example.com",
      guestFirstName: "Alice",
      venueName: "<script>evil</script>",
      visitDate: "2026-06-15",
      feedbackUrl: null,
      unsubscribeToken: "tok",
    });

    expect(html).not.toContain("<script>evil</script>");
    expect(html).toContain("&lt;script&gt;evil&lt;/script&gt;");
  });

  it("HTML-escapes guestFirstName containing angle brackets", async () => {
    const html = await captureHtml({
      guestEmail: "g@example.com",
      guestFirstName: '<img src=x onerror="alert(1)">',
      venueName: "Cafe",
      visitDate: "2026-06-15",
      feedbackUrl: null,
      unsubscribeToken: "tok",
    });

    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain("&lt;img");
  });
});
