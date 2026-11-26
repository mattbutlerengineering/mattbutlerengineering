import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProviderRejectedError } from "../notifications/provider-rejected-error.js";

const { inviteMember } = vi.hoisted(() => ({ inviteMember: vi.fn() }));
vi.mock("./guest-membership.js", () => ({ inviteMember }));
vi.mock("./member-token.js", () => ({
  generateMemberToken: vi.fn(() => "tok-123"),
}));

import { buildMemberInviteEmail, inviteRegular } from "./member-invite.js";

const venue = { id: "v1", name: "Oak & Ember", slug: "oak" };
const guest = { id: "g1", name: "Alice", email: "alice@example.com" };

describe("buildMemberInviteEmail", () => {
  it("escapes names and the link in the body", () => {
    const { subject, html } = buildMemberInviteEmail({
      guestName: "<b>Al</b>",
      venueName: venue.name,
      url: "https://x.test/hospitality/book/oak?member=a&b",
    });
    expect(subject).toContain("Oak & Ember");
    expect(html).not.toContain("<b>Al</b>");
    expect(html).toContain("&lt;b&gt;Al&lt;/b&gt;");
    expect(html).toContain("Oak &amp; Ember");
    expect(html).toContain('href="https://x.test/hospitality/book/oak?member=a&amp;b"');
  });
});

describe("inviteRegular", () => {
  const findOrCreate = vi.fn();
  const sendClosureEmail = vi.fn();
  const deps = () => ({
    guestService: { findOrCreate } as never,
    dispatcher: { sendClosureEmail } as never,
    baseUrl: "https://mattbutlerengineering.com",
  });

  beforeEach(() => {
    vi.clearAllMocks();
    findOrCreate.mockResolvedValue(guest);
    inviteMember.mockResolvedValue({
      id: "m1",
      guestId: "g1",
      tier: "REGULAR",
      status: "ACTIVE",
      invitedAt: new Date("2026-11-01T10:00:00Z"),
      revokedAt: null,
    });
    sendClosureEmail.mockResolvedValue(undefined);
  });

  it("finds or creates the guest, activates membership and emails the member link", async () => {
    const result = await inviteRegular(
      { venue, email: "Alice@Example.com", name: "Alice" },
      deps()
    );

    expect(findOrCreate).toHaveBeenCalledWith("v1", { email: "alice@example.com", name: "Alice" });
    expect(inviteMember).toHaveBeenCalledWith({ venueId: "v1", guestId: "g1" });
    const mail = sendClosureEmail.mock.calls[0]![0] as { to: string; html: string };
    expect(mail.to).toBe("alice@example.com");
    expect(mail.html).toContain(
      "https://mattbutlerengineering.com/hospitality/book/oak?member=tok-123"
    );
    expect(result.status).toBe("sent");
    expect(result.member).toMatchObject({
      guestId: "g1",
      guestName: "Alice",
      status: "ACTIVE",
      invitedAt: "2026-11-01T10:00:00.000Z",
    });
  });

  it("reports failed when the provider rejects, so the caller never claims success", async () => {
    sendClosureEmail.mockRejectedValue(new ProviderRejectedError("nope"));
    const result = await inviteRegular({ venue, email: "a@b.co", name: "A" }, deps());
    expect(result.status).toBe("failed");
    expect(result.member.guestId).toBe("g1");
  });

  it("reports failed on any send error", async () => {
    sendClosureEmail.mockRejectedValue(new Error("timeout"));
    const result = await inviteRegular({ venue, email: "a@b.co", name: "A" }, deps());
    expect(result.status).toBe("failed");
  });
});
