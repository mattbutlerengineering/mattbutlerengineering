export interface SmsNotificationInput {
  reservationId: string;
  date: string;
  startTime: string;
  /** IANA timezone used to render `startTime` as venue-local time. */
  venueTimezone: string;
  partySize: number;
  guestName: string | null;
  guestPhone: string;
  venueName: string;
  manageToken: string;
  manageBaseUrl: string;
}

export interface WaitlistUpdateInput {
  guestName: string | null;
  guestPhone: string;
  venueName: string;
  date: string;
  partySize: number;
  manageToken: string;
  manageBaseUrl: string;
}

export interface WinbackMessageInput {
  guestName: string | null;
  guestPhone: string;
  venueName: string;
  manageBaseUrl: string;
}

export interface WaitlistAddedInput {
  guestPhone: string;
  guestName: string | null;
  position: number;
  estimatedWaitMinutes: number | null;
}

export interface WaitlistPositionUpdateInput {
  guestPhone: string;
  guestName: string | null;
  position: number;
  estimatedWaitMinutes: number | null;
}

export interface WaitlistTableReadyInput {
  guestPhone: string;
  guestName: string | null;
}

export interface ClosureSmsInput {
  to: string;
  /** The whole body: a link is never truncated. */
  body: string;
}

export interface SmsPort {
  /** A closure notice, already rendered (see closure-content.ts). */
  sendClosureNotice(input: ClosureSmsInput): Promise<void>;
  sendBookingReminder(input: SmsNotificationInput): Promise<void>;
  sendWaitlistUpdate(input: WaitlistUpdateInput): Promise<void>;
  sendWinbackMessage(input: WinbackMessageInput): Promise<void>;
  sendWaitlistAdded(input: WaitlistAddedInput): Promise<void>;
  sendWaitlistPositionUpdate(input: WaitlistPositionUpdateInput): Promise<void>;
  sendWaitlistTableReady(input: WaitlistTableReadyInput): Promise<void>;
}
