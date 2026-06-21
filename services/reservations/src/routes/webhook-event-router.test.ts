import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";
import { WebhookEventRouter } from "./webhook-event-router.js";

function makeEvent(type: string, data: object = {}): Stripe.Event {
  return {
    id: "evt_test",
    type,
    data: { object: data },
    api_version: "2023-10-16",
    created: 1234567890,
    livemode: false,
    pending_webhooks: 1,
    request: null,
    object: "event",
  } as unknown as Stripe.Event;
}

describe("WebhookEventRouter", () => {
  it("calls the registered handler for a matching event type", async () => {
    const router = new WebhookEventRouter();
    const handler = vi.fn().mockResolvedValue(undefined);

    router.register("payment_intent.succeeded", handler);

    const event = makeEvent("payment_intent.succeeded", { id: "pi_123" });
    await router.dispatch(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it("silently skips unknown event types (no error thrown)", async () => {
    const router = new WebhookEventRouter();

    const event = makeEvent("customer.created", { id: "cus_123" });
    await expect(router.dispatch(event)).resolves.toBeUndefined();
  });

  it("propagates handler errors", async () => {
    const router = new WebhookEventRouter();
    const error = new Error("handler failed");
    const handler = vi.fn().mockRejectedValue(error);

    router.register("charge.refunded", handler);

    const event = makeEvent("charge.refunded", { id: "ch_123" });
    await expect(router.dispatch(event)).rejects.toThrow("handler failed");
  });

  it("supports method chaining on register()", () => {
    const router = new WebhookEventRouter();
    const handlerA = vi.fn().mockResolvedValue(undefined);
    const handlerB = vi.fn().mockResolvedValue(undefined);

    const returned = router
      .register("payment_intent.succeeded", handlerA)
      .register("payment_intent.canceled", handlerB);

    expect(returned).toBe(router);
  });

  it("dispatches different events to their respective handlers independently", async () => {
    const router = new WebhookEventRouter();
    const handlerA = vi.fn().mockResolvedValue(undefined);
    const handlerB = vi.fn().mockResolvedValue(undefined);

    router.register("payment_intent.succeeded", handlerA);
    router.register("charge.refunded", handlerB);

    const eventA = makeEvent("payment_intent.succeeded", { id: "pi_456" });
    await router.dispatch(eventA);

    expect(handlerA).toHaveBeenCalledWith(eventA);
    expect(handlerB).not.toHaveBeenCalled();
  });
});
