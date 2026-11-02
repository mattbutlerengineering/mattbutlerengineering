/**
 * The email provider answered, and the answer was a refusal (`{ error }`): the message was not
 * accepted. Distinct from a timeout, a dropped connection or a crash, where nobody knows whether
 * the provider delivered. Win-back uses the difference to decide whether a send may be retried.
 */
export class ProviderRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderRejectedError";
  }
}
