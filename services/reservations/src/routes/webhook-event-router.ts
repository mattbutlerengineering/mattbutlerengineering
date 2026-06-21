import type Stripe from "stripe";

type WebhookHandler<T extends Stripe.Event = Stripe.Event> = (event: T) => Promise<void>;

/**
 * Registered event handler table for Stripe webhook events.
 *
 * Register handlers at module init; dispatch verifies signature BEFORE
 * calling dispatch — handlers only ever receive verified events.
 *
 * Unknown event types are silently skipped (return 200 to prevent Stripe retries).
 * Handler errors propagate to the caller.
 */
export class WebhookEventRouter {
  private readonly handlers = new Map<string, WebhookHandler>();

  register<T extends Stripe.Event>(eventType: T["type"], handler: WebhookHandler<T>): this {
    this.handlers.set(eventType, handler as WebhookHandler);
    return this;
  }

  async dispatch(event: Stripe.Event): Promise<void> {
    const handler = this.handlers.get(event.type);
    if (!handler) {
      return;
    }
    await handler(event);
  }
}
