export interface SmsNotificationInput {
  reservationId: string;
  date: string;
  startTime: string;
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

export interface SmsPort {
  sendBookingReminder(input: SmsNotificationInput): Promise<void>;
  sendWaitlistUpdate(input: WaitlistUpdateInput): Promise<void>;
  sendWinbackMessage(input: WinbackMessageInput): Promise<void>;
}
