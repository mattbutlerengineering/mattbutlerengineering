/**
 * Structured application error with a machine-readable code and HTTP status.
 * Thrown by service routes; caught by the Fastify error handler which
 * serializes it to an RFC 9457 problem-detail response.
 */
export class AppError extends Error {
  /** Alias for httpStatus — makes AppError compatible with classifyError's statusCode check. */
  public readonly statusCode: number;

  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
    message: string
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = httpStatus;
  }
}
