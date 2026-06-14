# @mbe/notifications

Email (Resend) and SMS (Twilio) notification delivery with guest communication-preference routing. Supports booking confirmations, reminders, modifications, cancellations, and win-back messaging.

## Structure

```
src/
├── index.ts                    # Re-exports
├── port.ts                     # NotificationPort interface + input types
├── sms-port.ts                 # SmsPort interface + SMS input types
├── notification-dispatcher.ts  # CommunicationPreference-based router
├── resend-adapter.ts           # Resend email implementation
├── twilio-sms-adapter.ts       # Twilio SMS implementation
├── booking-email-content.ts    # Email HTML content builder
└── ical.ts                     # iCal attachment generator
```

## Exports

| Entry                  | Key exports                                                                     |
| ---------------------- | ------------------------------------------------------------------------------- |
| `@mbe/notifications`   | `NotificationDispatcher`, `ResendNotificationAdapter`, `TwilioSmsAdapter`, `buildBookingEmailContent`, `generateBookingIcal` |
| `@mbe/notifications/ical` | `generateBookingIcal`, `IcalEventInput`, `IcalMethod`                        |

## NotificationDispatcher

Routes notifications based on `CommunicationPreference`:

| Preference           | Email | SMS | Marketing OK |
| -------------------- | ----- | --- | ------------ |
| `email_only`         | Yes   | No  | Yes          |
| `sms_only`           | Yes*  | Yes | Yes          |
| `both`               | Yes   | Yes | Yes          |
| `transactional_only` | Yes   | No  | No           |

\* SMS-only fallback: transactional emails still send (iCal only via email).

## Usage

```typescript
import { ResendNotificationAdapter, NotificationDispatcher } from "@mbe/notifications";

const emailAdapter = new ResendNotificationAdapter({
  resend: resendClient,
  fromAddress: "bookings@mbe.dev",
  manageBaseUrl: "https://manage.mattbutlerengineering.com",
});

const dispatcher = new NotificationDispatcher({
  emailAdapter,
  smsAdapter: null, // or TwilioSmsAdapter
});

await dispatcher.sendBookingConfirmation(input, "email_only");
```

## Commands

```bash
pnpm build          # Compile TypeScript
pnpm test           # Vitest unit tests
pnpm test:watch     # Vitest watch mode
pnpm test:coverage  # Coverage report
pnpm lint           # ESLint
pnpm typecheck      # Type check
```
