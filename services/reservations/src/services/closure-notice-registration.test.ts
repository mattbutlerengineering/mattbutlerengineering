import { describe, expect, it, vi } from "vitest";
import { JOB_TYPES } from "../jobs/index.js";
import type { ClosureNoticeDeps } from "./closure-notice.js";
import { createReservationJobHandlers } from "./job-worker.js";

const base = {
  getReservation: vi.fn(),
  getVenue: vi.fn(),
  dispatcher: { sendBookingReminder: vi.fn() },
  generateManageToken: vi.fn(),
  handleWaitlistExpiry: vi.fn(),
  logger: { warn: vi.fn() },
};

describe("CLOSURE_NOTICE registration", () => {
  it("is registered when closure-notice deps are given, and absent otherwise", () => {
    expect(createReservationJobHandlers(base)[JOB_TYPES.CLOSURE_NOTICE]).toBeUndefined();
    const withNotice = createReservationJobHandlers({
      ...base,
      closureNotice: {} as ClosureNoticeDeps,
    });
    expect(withNotice[JOB_TYPES.CLOSURE_NOTICE]).toBeTypeOf("function");
  });
});
