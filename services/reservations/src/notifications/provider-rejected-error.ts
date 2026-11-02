/**
 * The email provider answered, and the answer proves the message was NOT accepted (a 4xx about
 * this request). Distinct from a timeout, a dropped connection, a 5xx or a crash, where nobody
 * knows whether the provider delivered. Win-back uses the difference to decide whether a send
 * may be retried.
 */
export class ProviderRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderRejectedError";
  }
}

/**
 * No email provider is configured (no `RESEND_API_KEY`), so nothing was or could be sent. Thrown
 * by the senders that must not report "sent" when nothing went out (win-back); the others keep
 * their historical no-op.
 */
export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email sending is not configured");
    this.name = "EmailNotConfiguredError";
  }
}
