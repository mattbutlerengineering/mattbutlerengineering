import type { JobType } from "./job-types.js";

export type JobPayloadMap = {
  [JobType.BOOKING_REMINDER]: { reservationId: string; guestEmail: string };
  [JobType.DAY_OF_REMINDER]: { reservationId: string; guestEmail: string };
  [JobType.POST_VISIT_FOLLOWUP]: { reservationId: string; guestEmail: string };
  [JobType.PRE_ARRIVAL_BRIEFING]: { reservationId: string; guestEmail: string };
  [JobType.LAPSED_GUEST_SCAN]: { guestId: string };
  [JobType.WAITLIST_EXPIRY]: { waitlistId: string };
};

export type JobHandlerMap = {
  [K in JobType]: (payload: JobPayloadMap[K]) => Promise<void>;
};

export class JobWorker {
  constructor(private readonly handlers: JobHandlerMap) {}

  async handle<K extends JobType>(type: K, payload: JobPayloadMap[K]): Promise<void> {
    await (this.handlers[type] as (payload: JobPayloadMap[K]) => Promise<void>)(payload);
  }
}
