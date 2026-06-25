export interface BookingNotificationInput {
  reservationId: string;
  date: string;
  startTime: string;
  endTime: string;
  partySize: number;
  guestName: string | null;
  guestEmail: string;
  guestPhone: string | null;
  specialRequests: string | null;
  venueName: string;
  venueTimezone: string;
  venueAddress: string | null;
  manageToken: string;
  sequence?: number;
}

export interface WinBackNotificationInput {
  guestName: string;
  guestEmail: string;
  venueName: string;
}

export interface ThankYouEmailInput {
  guestEmail: string;
  guestFirstName: string | null;
  venueName: string;
  visitDate: string;
  feedbackUrl: string | null;
  unsubscribeToken: string;
}

export interface NotificationPort {
  sendBookingConfirmation(input: BookingNotificationInput): Promise<void>;
  sendBookingReminder(input: BookingNotificationInput): Promise<void>;
  sendBookingModified(input: BookingNotificationInput): Promise<void>;
  sendBookingCancelled(input: BookingNotificationInput): Promise<void>;
  sendWinBack(input: WinBackNotificationInput): Promise<void>;
  sendThankYouEmail(input: ThankYouEmailInput): Promise<void>;
}
