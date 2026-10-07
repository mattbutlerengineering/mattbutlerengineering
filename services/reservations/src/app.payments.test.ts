import { describe, it, expect, vi, afterEach } from "vitest";
import { buildApp } from "./app.js";
import { createInMemoryPayments } from "./transitions/in-memory.js";
import { DepositService } from "./services/deposit.js";
import { StripeService } from "./services/stripe.js";

const { mockGuestDb } = vi.hoisted(() => ({
  mockGuestDb: {
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({ id: "guest-1", stripeCustomerId: "cus_mem_1" }),
  },
}));

vi.mock("./services/database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({ prisma: { guest: mockGuestDb } });
});

/** buildApp is the one place payments (Stripe) and DepositService are constructed. */
describe("buildApp payments composition (3.3)", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it("decorates the injected payments and builds DepositService over it", async () => {
    const payments = createInMemoryPayments();
    const app = await buildApp({ logger: false, payments });
    close = () => app.close();

    expect(app.payments).toBe(payments);
    expect(app.services.depositService).toBeInstanceOf(DepositService);

    const customerId = await app.services.depositService.ensureStripeCustomer(
      "guest-1",
      "jane@example.com",
      "Jane"
    );
    expect(customerId).toBe("cus_mem_1");
    expect(payments.calls).toEqual([
      {
        op: "createCustomer",
        args: [{ email: "jane@example.com", name: "Jane", metadata: { guestId: "guest-1" } }],
      },
    ]);
  });

  it("constructs one StripeService when no payments are injected", async () => {
    const app = await buildApp({ logger: false });
    close = () => app.close();
    expect(app.payments).toBeInstanceOf(StripeService);
  });

  it("still lets options.services override the deposit service", async () => {
    const fake = { getById: vi.fn() } as unknown as DepositService;
    const app = await buildApp({ logger: false, services: { depositService: fake } });
    close = () => app.close();
    expect(app.services.depositService).toBe(fake);
  });
});
