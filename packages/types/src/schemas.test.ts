import { describe, it, expect } from "vitest";
import { UserSchema, UserPreferencesSchema, UserProfileSchema } from "./schemas/user.js";
import { GuestSchema, GuestSegmentSchema } from "./schemas/guest.js";
import { PaginationSchema, ErrorResponseSchema } from "./schemas/common.js";
import { ProblemDetailsSchema } from "./schemas/api.js";

// ── UserPreferencesSchema ──────────────────────────────────────────

describe("UserPreferencesSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    expect(UserPreferencesSchema.safeParse({}).success).toBe(true);
  });

  it("accepts all preferences populated", () => {
    const prefs = { theme: "dark", emailNotifications: true, marketingEmails: false };
    expect(UserPreferencesSchema.safeParse(prefs).success).toBe(true);
  });

  it("accepts valid theme values", () => {
    expect(UserPreferencesSchema.safeParse({ theme: "light" }).success).toBe(true);
    expect(UserPreferencesSchema.safeParse({ theme: "dark" }).success).toBe(true);
    expect(UserPreferencesSchema.safeParse({ theme: "system" }).success).toBe(true);
  });

  it("rejects invalid theme values", () => {
    expect(UserPreferencesSchema.safeParse({ theme: "blue" }).success).toBe(false);
    expect(UserPreferencesSchema.safeParse({ theme: "" }).success).toBe(false);
  });

  it("rejects non-boolean notification fields", () => {
    expect(UserPreferencesSchema.safeParse({ emailNotifications: "yes" }).success).toBe(false);
    expect(UserPreferencesSchema.safeParse({ marketingEmails: 1 }).success).toBe(false);
  });
});

// ── UserSchema ─────────────────────────────────────────────────────

describe("UserSchema", () => {
  const validUser = {
    id: "user-123",
    email: "test@example.com",
    name: "Test User",
    picture: "https://example.com/avatar.png",
    emailVerified: true,
    preferences: {},
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
  };

  it("accepts a valid user", () => {
    expect(UserSchema.safeParse(validUser).success).toBe(true);
  });

  it("accepts user with null optional fields", () => {
    const user = { ...validUser, name: null, picture: null };
    expect(UserSchema.safeParse(user).success).toBe(true);
  });

  it("accepts user with full preferences", () => {
    const user = {
      ...validUser,
      preferences: { theme: "dark", emailNotifications: true, marketingEmails: false },
    };
    expect(UserSchema.safeParse(user).success).toBe(true);
  });

  it("rejects invalid email format", () => {
    expect(UserSchema.safeParse({ ...validUser, email: "not-an-email" }).success).toBe(false);
    expect(UserSchema.safeParse({ ...validUser, email: "" }).success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const { id: _, ...noId } = validUser;
    expect(UserSchema.safeParse(noId).success).toBe(false);

    const { email: _e, ...noEmail } = validUser;
    expect(UserSchema.safeParse(noEmail).success).toBe(false);

    const { emailVerified: _ev, ...noVerified } = validUser;
    expect(UserSchema.safeParse(noVerified).success).toBe(false);

    const { preferences: _p, ...noPrefs } = validUser;
    expect(UserSchema.safeParse(noPrefs).success).toBe(false);
  });

  it("rejects non-boolean emailVerified", () => {
    expect(UserSchema.safeParse({ ...validUser, emailVerified: "yes" }).success).toBe(false);
  });
});

// ── UserProfileSchema ──────────────────────────────────────────────

describe("UserProfileSchema", () => {
  it("accepts a valid profile", () => {
    expect(UserProfileSchema.safeParse({ id: "u1", name: "Alice", picture: "url" }).success).toBe(
      true
    );
  });

  it("accepts profile with null name and picture", () => {
    expect(UserProfileSchema.safeParse({ id: "u1", name: null, picture: null }).success).toBe(true);
  });

  it("rejects missing id", () => {
    expect(UserProfileSchema.safeParse({ name: "Alice", picture: null }).success).toBe(false);
  });
});

// ── GuestSchema ────────────────────────────────────────────────────

describe("GuestSchema", () => {
  const validGuest = {
    id: "guest-1",
    venueId: "venue-1",
    email: "guest@example.com",
    phone: "+1-555-0100",
    name: "Jane Smith",
    notes: "VIP guest",
    visitCount: 12,
    lifetimeSpend: "4500.00",
    lastVisit: "2026-05-01T12:00:00.000Z",
    tags: ["vip", "regular"],
    dietaryRestrictions: ["gluten-free"],
    staffNotes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
  };

  it("accepts a fully populated guest", () => {
    expect(GuestSchema.safeParse(validGuest).success).toBe(true);
  });

  it("accepts guest with all nullable fields null", () => {
    const guest = {
      ...validGuest,
      email: null,
      phone: null,
      notes: null,
      lifetimeSpend: null,
      lastVisit: null,
      tags: null,
      dietaryRestrictions: null,
    };
    expect(GuestSchema.safeParse(guest).success).toBe(true);
  });

  it("accepts guest with empty tags array", () => {
    const guest = { ...validGuest, tags: [] };
    expect(GuestSchema.safeParse(guest).success).toBe(true);
  });

  it("rejects missing required name", () => {
    const { name: _, ...noName } = validGuest;
    expect(GuestSchema.safeParse(noName).success).toBe(false);
  });

  it("rejects non-number visitCount", () => {
    expect(GuestSchema.safeParse({ ...validGuest, visitCount: "12" }).success).toBe(false);
  });

  it("rejects non-string array elements in tags", () => {
    expect(GuestSchema.safeParse({ ...validGuest, tags: [1, 2] }).success).toBe(false);
  });
});

// ── GuestSegmentSchema ─────────────────────────────────────────────

describe("GuestSegmentSchema", () => {
  it("accepts a valid segment", () => {
    const segment = { name: "VIP", description: "High-value guests", count: 42 };
    expect(GuestSegmentSchema.safeParse(segment).success).toBe(true);
  });

  it("rejects missing fields", () => {
    expect(GuestSegmentSchema.safeParse({ name: "VIP" }).success).toBe(false);
    expect(GuestSegmentSchema.safeParse({ name: "VIP", description: "x" }).success).toBe(false);
  });

  it("rejects non-number count", () => {
    expect(
      GuestSegmentSchema.safeParse({ name: "VIP", description: "x", count: "42" }).success
    ).toBe(false);
  });
});

// ── PaginationSchema ───────────────────────────────────────────────

describe("PaginationSchema", () => {
  it("accepts valid pagination", () => {
    const pagination = {
      page: 1,
      limit: 20,
      total: 100,
      totalPages: 5,
      hasNext: true,
      hasPrev: false,
    };
    expect(PaginationSchema.safeParse(pagination).success).toBe(true);
  });

  it("rejects missing fields", () => {
    expect(PaginationSchema.safeParse({ page: 1, limit: 20 }).success).toBe(false);
  });

  it("rejects non-number page/limit", () => {
    const pagination = {
      page: "1",
      limit: 20,
      total: 100,
      totalPages: 5,
      hasNext: true,
      hasPrev: false,
    };
    expect(PaginationSchema.safeParse(pagination).success).toBe(false);
  });

  it("rejects non-boolean hasNext/hasPrev", () => {
    const pagination = { page: 1, limit: 20, total: 100, totalPages: 5, hasNext: 1, hasPrev: 0 };
    expect(PaginationSchema.safeParse(pagination).success).toBe(false);
  });
});

// ── ErrorResponseSchema ────────────────────────────────────────────

describe("ErrorResponseSchema", () => {
  it("accepts a valid error response", () => {
    const err = { error: "NotFound", message: "Resource not found", statusCode: 404 };
    expect(ErrorResponseSchema.safeParse(err).success).toBe(true);
  });

  it("rejects missing error field", () => {
    expect(ErrorResponseSchema.safeParse({ message: "msg", statusCode: 500 }).success).toBe(false);
  });

  it("rejects non-number statusCode", () => {
    expect(
      ErrorResponseSchema.safeParse({ error: "E", message: "m", statusCode: "404" }).success
    ).toBe(false);
  });
});

// ── ProblemDetailsSchema (RFC 9457) ────────────────────────────────

describe("ProblemDetailsSchema", () => {
  it("accepts a valid problem details response", () => {
    const problem = {
      type: "https://example.com/errors/not-found",
      title: "Not Found",
      status: 404,
      detail: "The requested reservation was not found",
    };
    expect(ProblemDetailsSchema.safeParse(problem).success).toBe(true);
  });

  it("accepts about:blank as type", () => {
    const problem = {
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      detail: "Invalid input",
    };
    expect(ProblemDetailsSchema.safeParse(problem).success).toBe(true);
  });

  it("accepts problem with optional instance and extra fields", () => {
    const problem = {
      type: "https://example.com/errors/validation",
      title: "Validation Error",
      status: 422,
      detail: "partySize must be positive",
      instance: "/reservations/123",
      fieldErrors: [{ field: "partySize", message: "must be > 0" }],
    };
    expect(ProblemDetailsSchema.safeParse(problem).success).toBe(true);
  });

  it("rejects invalid type (not a URL or about:blank)", () => {
    const problem = {
      type: "not-a-url",
      title: "Error",
      status: 500,
      detail: "Something failed",
    };
    expect(ProblemDetailsSchema.safeParse(problem).success).toBe(false);
  });

  it("rejects status outside valid HTTP range", () => {
    expect(
      ProblemDetailsSchema.safeParse({ type: "about:blank", title: "X", status: 99, detail: "d" })
        .success
    ).toBe(false);
    expect(
      ProblemDetailsSchema.safeParse({ type: "about:blank", title: "X", status: 600, detail: "d" })
        .success
    ).toBe(false);
  });

  it("rejects non-integer status", () => {
    expect(
      ProblemDetailsSchema.safeParse({
        type: "about:blank",
        title: "X",
        status: 404.5,
        detail: "d",
      }).success
    ).toBe(false);
  });

  it("rejects missing required fields", () => {
    expect(ProblemDetailsSchema.safeParse({ title: "X", status: 400, detail: "d" }).success).toBe(
      false
    );
    expect(
      ProblemDetailsSchema.safeParse({ type: "about:blank", status: 400, detail: "d" }).success
    ).toBe(false);
    expect(
      ProblemDetailsSchema.safeParse({ type: "about:blank", title: "X", detail: "d" }).success
    ).toBe(false);
    expect(
      ProblemDetailsSchema.safeParse({ type: "about:blank", title: "X", status: 400 }).success
    ).toBe(false);
  });
});
