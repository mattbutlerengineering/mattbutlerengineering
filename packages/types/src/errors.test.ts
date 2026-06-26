import { describe, it, expect } from "vitest";
import { AppError } from "./errors.js";

describe("AppError", () => {
  it("captures code, httpStatus, and message", () => {
    const err = new AppError("VENUE_NOT_FOUND", 404, "No venue found with slug 'oak'.");

    expect(err.code).toBe("VENUE_NOT_FOUND");
    expect(err.httpStatus).toBe(404);
    expect(err.message).toBe("No venue found with slug 'oak'.");
  });

  it("aliases httpStatus as statusCode for classifyError compatibility", () => {
    const err = new AppError("PACING_EXCEEDED", 422, "Pacing limit reached.");

    expect(err.statusCode).toBe(422);
    expect(err.statusCode).toBe(err.httpStatus);
  });

  it("sets the name to AppError and is an Error instance", () => {
    const err = new AppError("HOLD_EXPIRED", 410, "Hold expired.");

    expect(err.name).toBe("AppError");
    expect(err).toBeInstanceOf(Error);
  });
});
