import { describe, it, expect } from "vitest";
import type { Reservation } from "@mbe/types";
import {
  createInMemoryEvents,
  createInMemoryJobs,
  createInMemoryMessaging,
  createInMemoryPayments,
} from "./in-memory.js";
import { StripeOperationError } from "../services/stripe.js";
import { allOutboundLive } from "./venue-policy.js";

const reservation = { id: "res-1", venueId: "venue-1" } as Reservation;

describe("in-memory transition adapters", () => {
  it("messaging records sends and fails exactly once on a scripted kind", async () => {
    const messaging = createInMemoryMessaging();
    messaging.failNext("booking-modified");
    await expect(
      messaging.send({ kind: "booking-modified", reservation, manageToken: "t" })
    ).rejects.toThrow("scripted booking-modified failure");
    await messaging.send({ kind: "booking-modified", reservation, manageToken: "t" });
    await messaging.send({ kind: "post-visit-thank-you", reservation });
    expect(messaging.sent.map((m) => m.kind)).toEqual(["booking-modified", "post-visit-thank-you"]);
  });

  it("jobs is a map whose cancel reports whether the job existed", async () => {
    const jobs = createInMemoryJobs();
    const payload = { reservationId: "res-1", venueId: "venue-1" };
    await jobs.schedule("booking-reminder", payload, 5, "booking-reminder:res-1");
    expect(jobs.jobs.get("booking-reminder:res-1")).toEqual({
      jobType: "booking-reminder",
      delayMs: 5,
      payload,
    });
    expect(await jobs.cancel("booking-reminder:res-1")).toBe(true);
    expect(await jobs.cancel("booking-reminder:res-1")).toBe(false);
    expect(jobs.jobs.size).toBe(0);
  });

  it("events records what was published", () => {
    const events = createInMemoryEvents();
    events.publish({ type: "reservation:updated", venueId: "venue-1", data: reservation });
    expect(events.published).toEqual([
      { type: "reservation:updated", venueId: "venue-1", data: reservation },
    ]);
  });

  it("the production policy source is live for every venue", async () => {
    expect(await allOutboundLive("venue-1")).toEqual({ outbound: "live" });
    expect(await allOutboundLive("")).toEqual({ outbound: "live" });
  });
});

describe("createInMemoryPayments", () => {
  it("returns deterministic ids and records every call with its idempotency key", async () => {
    const payments = createInMemoryPayments();
    const customer = await payments.createCustomer({
      email: "jane@example.com",
      name: "Jane",
      idempotencyKey: "cus-key",
    });
    const intent = await payments.createPaymentIntent({
      amountCents: 2500,
      currency: "usd",
      customerId: customer.id,
      reservationId: "res-1",
      idempotencyKey: "pi-key",
    });
    const refund = await payments.createPartialRefund(intent.id, 1000, "dep-1", "refund-key");

    expect(customer).toEqual({ id: "cus_mem_1", email: "jane@example.com", name: "Jane" });
    expect(intent).toEqual({
      id: "pi_mem_1",
      status: "requires_payment_method",
      clientSecret: "pi_mem_1_secret",
    });
    expect(refund).toEqual({ id: "re_mem_1", status: "succeeded", amount: 1000 });
    expect(await payments.capturePaymentIntent("pi_x", "cap-key")).toEqual({
      id: "pi_x",
      status: "succeeded",
    });
    expect(await payments.cancelPaymentIntent("pi_y")).toEqual({ id: "pi_y", status: "canceled" });
    expect(await payments.retrievePaymentIntent("pi_z")).toEqual({
      id: "pi_z",
      status: "requires_capture",
    });
    expect(await payments.findDepositRefund("pi_z", "dep-1")).toBeNull();
    expect(payments.calls.map((c) => c.op)).toEqual([
      "createCustomer",
      "createPaymentIntent",
      "createPartialRefund",
      "capturePaymentIntent",
      "cancelPaymentIntent",
      "retrievePaymentIntent",
      "findDepositRefund",
    ]);
    expect(payments.calls[2]).toEqual({
      op: "createPartialRefund",
      args: ["pi_mem_1", 1000, "dep-1", "refund-key"],
    });
    expect(payments.calls[3]!.args).toEqual(["pi_x", "cap-key"]);
  });

  it("scripts a result per op", async () => {
    const payments = createInMemoryPayments();
    payments.respond("retrievePaymentIntent", (id) => ({ id, status: "succeeded" }));
    payments.respond("findDepositRefund", () => ({ id: "re_prior", amount: 700 }));
    expect(await payments.retrievePaymentIntent("pi_1")).toEqual({
      id: "pi_1",
      status: "succeeded",
    });
    expect(await payments.findDepositRefund("pi_1", "dep-1")).toEqual({
      id: "re_prior",
      amount: 700,
    });
  });

  it.each([
    ["StripeConnectionError", true],
    ["StripeRateLimitError", true],
    ["StripeCardError", false],
    ["StripeInvalidRequestError", false],
  ] as const)(
    "failNext throws a StripeOperationError of type %s (retriable: %s), once",
    async (type, retriable) => {
      const payments = createInMemoryPayments();
      payments.failNext("capturePaymentIntent", type);
      const err = await payments.capturePaymentIntent("pi_1").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(StripeOperationError);
      expect(err).toMatchObject({ stripeType: type, isRetriable: retriable });
      expect(payments.calls).toHaveLength(1);
      await expect(payments.capturePaymentIntent("pi_1")).resolves.toMatchObject({
        status: "succeeded",
      });
    }
  );
});
