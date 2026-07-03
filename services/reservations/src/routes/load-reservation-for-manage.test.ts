import { describe, it, expect } from "vitest";
import { manageProblemDetails, reservationNotFoundProblem } from "./load-reservation-for-manage.js";
import type { ManagePreambleResult } from "./load-reservation-for-manage.js";

type NotOkPreamble = Extract<ManagePreambleResult, { ok: false }>;

describe("reservationNotFoundProblem", () => {
  it("builds the shared 404 not-found problem", () => {
    expect(reservationNotFoundProblem()).toMatchObject({
      status: 404,
      title: "Reservation Not Found",
      detail: "Reservation not found",
      code: "RESERVATION_NOT_FOUND",
    });
  });
});

describe("manageProblemDetails", () => {
  const notFound: NotOkPreamble = { ok: false, status: 404, reason: "not_found" };
  const cancelled: NotOkPreamble = { ok: false, status: 409, reason: "cancelled" };
  const completed: NotOkPreamble = { ok: false, status: 409, reason: "completed" };

  it("returns the shared not-found problem regardless of action", () => {
    expect(manageProblemDetails(notFound, "cancel")).toMatchObject({
      status: 404,
      title: "Reservation Not Found",
      code: "RESERVATION_NOT_FOUND",
    });
    expect(manageProblemDetails(notFound, "modify")).toMatchObject({
      status: 404,
      title: "Reservation Not Found",
      code: "RESERVATION_NOT_FOUND",
    });
  });

  it("uses cancel-specific copy for an already-cancelled reservation", () => {
    expect(manageProblemDetails(cancelled, "cancel")).toMatchObject({
      status: 409,
      title: "Already Cancelled",
      detail: "This reservation is already cancelled",
      code: "RESERVATION_ALREADY_CANCELLED",
    });
  });

  it("uses cancel-specific copy for a completed reservation", () => {
    expect(manageProblemDetails(completed, "cancel")).toMatchObject({
      status: 409,
      title: "Cannot Cancel",
      detail: "Cannot cancel a completed reservation",
      code: "RESERVATION_ALREADY_COMPLETED",
    });
  });

  it("uses modify-specific copy for a cancelled reservation", () => {
    expect(manageProblemDetails(cancelled, "modify")).toMatchObject({
      status: 409,
      title: "Cannot Modify",
      detail: "Cannot modify a cancelled reservation",
      code: "RESERVATION_ALREADY_CANCELLED",
    });
  });

  it("uses modify-specific copy for a completed reservation", () => {
    expect(manageProblemDetails(completed, "modify")).toMatchObject({
      status: 409,
      title: "Cannot Modify",
      detail: "Cannot modify a completed reservation",
      code: "RESERVATION_ALREADY_COMPLETED",
    });
  });
});
