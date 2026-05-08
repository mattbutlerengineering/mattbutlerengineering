# Email & SMS Provider Evaluation — February 2026

## Current State

| Dimension                     | Value                                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Email provider**            | None (Auth0 built-in only)                                                                                      |
| **SMS provider**              | None                                                                                                            |
| **Auth0 email**               | Default SMTP (no-reply@auth0user.net, 10 emails/min, **not production-ready**)                                  |
| **Auth0 SMS**                 | None configured                                                                                                 |
| **Transactional email needs** | Reservation confirmations, reminders (venue settings exist: `confirmationEmailEnabled`, `reminderEmailEnabled`) |
| **User preferences**          | `emailNotifications` and `marketingEmails` flags exist in user schema                                           |
| **Guest contact data**        | `guestEmail` and `guestPhone` captured on reservations                                                          |
| **Venue settings**            | `requireEmail` and `requirePhone` flags exist                                                                   |
| **Monthly email cost**        | $0                                                                                                              |

### Architecture (Current)

```
┌──────────────┐
│  Dashboard   │──── user signs up ────►┌──────────────┐
│  (React)     │                        │  Auth0        │
└──────────────┘                        │  (built-in    │
                                        │   SMTP)       │
                                        │               │
                                        │  ⚠ 10/min     │
                                        │  ⚠ no custom  │
                                        │    domain     │
                                        └──────────────┘

┌──────────────┐                        ┌──────────────┐
│  Reservations│──── confirmation? ────►│  ??? (none)  │
│  Service     │──── reminder?    ────►│              │
│  (Fastify)   │                        └──────────────┘
└──────────────┘
```

### Architecture (Target)

```
┌──────────────┐                         ┌──────────────┐
│  Dashboard   │──── signup ────────────►│  Auth0        │
│  (React)     │                         │  (custom SMTP │
└──────────────┘                         │   provider)   │
                                         └──────┬───────┘
                                                │
┌──────────────┐                                ▼
│  Reservations│                         ┌──────────────┐
│  Service     │──── confirmation ──────►│  Email       │
│  (Fastify)   │──── reminder    ──────►│  Provider    │
└──────────────┘──── cancellation ──────►│  (API)       │
       │                                 └──────────────┘
       │
       │ (future)                        ┌──────────────┐
       └──── SMS confirmation ─────────►│  SMS Provider │
             SMS reminder       ────────►│  (API)        │
                                         └──────────────┘
```

### Pain Points

- **Auth0 emails are not production-ready** — the built-in provider sends from `no-reply@auth0user.net`, limited to 10 emails/minute, and Auth0's docs explicitly say it's for testing only
- **No reservation emails** — `confirmationEmailEnabled` and `reminderEmailEnabled` settings exist in the venue schema but have no implementation; guests receive no confirmation after booking
- **No custom domain emails** — no ability to send from `@mattbutlerengineering.com`
- **No SMS capability** — `requirePhone` exists but there's no way to contact guests by phone/SMS

### Use Cases (Priority Order)

1. **Auth0 custom email provider** — replace built-in SMTP with branded, reliable email (verification, password reset, MFA codes)
2. **Reservation confirmation emails** — sent to guests after booking
3. **Reservation reminder emails** — sent to guests before their reservation
4. **Cancellation/modification emails** — sent when reservations change
5. **Account notification emails** — based on `emailNotifications` user preference
6. **Marketing emails** — based on `marketingEmails` user preference (lower priority)
7. **SMS confirmations/reminders** — future, based on `requirePhone` venue setting

---

## Evaluation Criteria

| Criterion                | Why It Matters                                                                    |
| ------------------------ | --------------------------------------------------------------------------------- |
| **Developer experience** | TypeScript SDK quality, API design, time-to-first-send, React Email compatibility |
| **Deliverability**       | Transactional emails (confirmations, password resets) must reach inbox, not spam  |
| **Free tier**            | Solo developer; reservation volume is low initially                               |
| **Pricing at scale**     | Cost per email as volume grows (hundreds → thousands/month)                       |
| **Auth0 integration**    | Must work as Auth0 custom email provider via Actions                              |
| **React Email support**  | Email templates built with React components in a React/TypeScript monorepo        |
| **Template management**  | How templates are managed — code-based vs dashboard vs both                       |
| **Reliability & uptime** | Reservation confirmations are time-sensitive; missed emails erode trust           |
| **Company stability**    | Startup risk, acquisition risk, pricing predictability                            |
| **SMS capability**       | Whether the same provider can handle SMS (consolidation vs best-of-breed)         |

---

## Email Provider Profiles

### 1. Resend

Developer-focused transactional email API. Founded 2022 in San Francisco by Zeno Rocha, Bu Kinoshita, and Jonni Lundy. $21.5M total funding (Series A, December 2024). ~30 employees.

| Criterion                | Details                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------- |
| **Free tier**            | 3,000 emails/month, 1 custom domain, basic analytics                                  |
| **Pro plan**             | $20/mo for 50,000 emails                                                              |
| **Scale plan**           | $90/mo for 100,000 emails                                                             |
| **Overage**              | Pay-as-you-go on paid plans; hard limit of 5x monthly quota                           |
| **Per-email cost (Pro)** | $0.40/1,000 emails ($20 / 50K)                                                        |
| **SDK**                  | `resend` npm package; TypeScript-native; 7 language SDKs                              |
| **React Email**          | Native integration — same team built both; pass React components directly to send API |
| **API design**           | REST, minimal; `resend.emails.send({ from, to, subject, react: <Component /> })`      |
| **Rate limit**           | 2 requests/second (default); batch API supports 100 emails/request                    |
| **Auth0 integration**    | Via Auth0 Actions (custom email provider trigger); straightforward REST call          |
| **Deliverability**       | Good; shared IP on free/Pro; dedicated IP on Enterprise only                          |
| **Template management**  | Code-based (React Email); also supports dashboard templates with visual editor        |
| **Inbound email**        | Supported (added 2025); webhooks for incoming email parsing                           |
| **Webhooks**             | Delivery, bounce, complaint, open, click events                                       |

**Key strength for this project:** React Email was created by Resend's co-founder. The integration is zero-friction: you write email templates as React components in your TypeScript monorepo, import them, and pass them directly to `resend.emails.send()`. No separate template rendering step.

**Key weakness:** Young company (founded 2022, Series A). 2 requests/second rate limit is aggressive — adequate for this project's volume but could be a constraint at scale. No dedicated IP below Enterprise tier. Community is smaller than established players.

---

### 2. Postmark

Transactional-only email service, acquired by ActiveCampaign in 2023. Known for industry-leading deliverability. Strict customer vetting — they reject customers with questionable use cases, which keeps their IP reputation pristine.

| Criterion               | Details                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| **Free tier**           | 100 emails/month (testing only, no credit card required)                        |
| **Basic plan**          | $15/mo for 10,000 emails (1 user, 10 servers, 3 message streams)                |
| **Pro plan**            | $16.50/mo for 10,000 emails (10 users, 25 servers, 10 message streams)          |
| **Platform plan**       | $18/mo for 10,000 emails (unlimited everything)                                 |
| **Overage**             | $1.20–$1.80/1,000 emails depending on tier; never cuts you off                  |
| **Per-email cost**      | $1.50/1,000 at base; drops with volume tiers                                    |
| **SDK**                 | `postmark` npm package (postmark.js); TypeScript support but JS-primary         |
| **React Email**         | Supported — render React Email to HTML, pass to Postmark API                    |
| **API design**          | REST; clean but more verbose than Resend                                        |
| **Rate limit**          | Not published; generally permissive for transactional use                       |
| **Auth0 integration**   | Via Auth0 Actions; REST call or SMTP                                            |
| **Deliverability**      | Best-in-class — 22.3% better inbox placement than SendGrid in independent tests |
| **Template management** | Dashboard templates with variables; code-based via API                          |
| **Inbound email**       | Supported; webhook-based                                                        |
| **Webhooks**            | Delivery, bounce, spam complaint, open, click events                            |

**Key strength:** Deliverability. Postmark consistently ranks #1 or #2 in independent deliverability tests. For reservation confirmations that must reach the inbox, this matters. Their strict focus on transactional-only email (no marketing) keeps their sending reputation clean.

**Key weakness:** Free tier is only 100 emails/month (effectively testing only). Acquired by ActiveCampaign — SDK last released June 2024, raising questions about continued investment. Per-email cost is higher than Resend or SES. React Email integration requires a manual render step (render to HTML, then pass to API).

---

### 3. Amazon SES

AWS's email service. The cheapest option at scale. Requires an AWS account.

| Criterion               | Details                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| **Free tier**           | 3,000 emails/month for 12 months (new AWS accounts); post-July 2025: $200 AWS free credits |
| **Per-email cost**      | $0.10/1,000 emails ($0.0001/email) — the cheapest by far                                   |
| **Additional costs**    | $0.12/GB data transfer; dedicated IP $24.95/mo                                             |
| **SDK**                 | `@aws-sdk/client-ses` and `@aws-sdk/client-sesv2`; TypeScript-native (AWS SDK v3)          |
| **React Email**         | Supported — render to HTML, pass to SES API                                                |
| **API design**          | AWS SDK patterns; verbose, command-based (`SendEmailCommand`)                              |
| **Rate limit**          | 1 email/second initially; increases with reputation (up to hundreds/sec)                   |
| **Auth0 integration**   | Via Auth0 Actions; requires AWS credentials in Auth0                                       |
| **Deliverability**      | Good; requires manual reputation management (dedicated IP warm-up, SPF/DKIM/DMARC setup)   |
| **Template management** | SES templates (limited); code-based via SDK                                                |
| **Inbound email**       | Supported (receipt rules)                                                                  |
| **Webhooks**            | Via SNS topics for bounces, complaints, deliveries                                         |

**Key strength:** Cost. At $0.10/1,000 emails, SES is 4-15x cheaper than any competitor at volume. For a project that might send millions of emails, SES is the obvious choice. The AWS SDK v3 is fully TypeScript-native with excellent type definitions.

**Key weakness:** Operational complexity. SES requires manual setup of domain verification, DKIM, SPF, DMARC, bounce handling, complaint processing, and IP warm-up. The "sandbox" mode (1 email/sec, verified recipients only) requires a support request to exit. No built-in template designer. Deliverability is your responsibility — SES provides the infrastructure, not the reputation management. For a solo developer, this is significant overhead.

---

### 4. Twilio SendGrid

The incumbent. Owned by Twilio since 2019. The most widely-used email API.

| Criterion                       | Details                                                              |
| ------------------------------- | -------------------------------------------------------------------- |
| **Free tier**                   | **Retired May 2025** — no free tier for new customers                |
| **Essentials plan**             | $19.95/mo for 50,000 emails                                          |
| **Pro plan**                    | $89.95/mo for 100,000 emails                                         |
| **Per-email cost (Essentials)** | $0.40/1,000 emails; overage $1.33/1,000                              |
| **SDK**                         | `@sendgrid/mail`; JavaScript with `@types/sendgrid` for TypeScript   |
| **React Email**                 | Supported — render to HTML, pass to SendGrid API                     |
| **API design**                  | REST; well-documented but showing age; complex configuration options |
| **Rate limit**                  | Generous (varies by plan)                                            |
| **Auth0 integration**           | Native Auth0 integration in dashboard (SMTP); also Actions           |
| **Deliverability**              | Good; varies by shared IP pool reputation                            |
| **Template management**         | Dashboard drag-and-drop editor; Dynamic Templates with Handlebars    |
| **Inbound email**               | Supported (Inbound Parse webhook)                                    |
| **Webhooks**                    | Full event tracking                                                  |

**Key weakness for this project:** Free tier was retired in May 2025. Twilio has undergone multiple rounds of layoffs (2022-2024). Pricing structure is complex with dual subscriptions (API + Marketing), additional IP costs ($30/mo), and storage overage fees. The SDK is JavaScript-first, not TypeScript-native. For a new project in 2026, SendGrid is the legacy option — still functional but not where developer momentum is heading.

---

### 5. Mailgun (Sinch)

Developer-oriented email API owned by Sinch (which also owns MessageBird). Part of the Pathwire email platform.

| Criterion               | Details                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| **Free tier**           | 100 emails/day (3,000/month effective); 1 custom domain; 1 day data retention |
| **Basic plan**          | $15/mo for 10,000 emails                                                      |
| **Foundation plan**     | $35/mo for 50,000 emails                                                      |
| **Overage**             | Flex plan: $2.00/1,000 (doubled from $1.00 in December 2025)                  |
| **SDK**                 | `mailgun.js`; TypeScript support via `@types/mailgun-js`                      |
| **React Email**         | Supported — render to HTML, pass to API                                       |
| **Deliverability**      | Good; dedicated IP available on paid plans                                    |
| **Template management** | Dashboard templates; API-based                                                |

**Key weakness for this project:** Flex plan price doubled in late 2025, signaling pricing instability. Free tier has only 1 day of data retention. SDK is not TypeScript-native. Ownership chain (Sinch → Pathwire → Mailgun) adds corporate uncertainty. Not a clear leader in any dimension for this project's needs.

---

## Head-to-Head Comparison

### 1. Developer Experience

| Dimension                 | Resend             | Postmark             | Amazon SES                  | SendGrid                  | Mailgun                   |
| ------------------------- | ------------------ | -------------------- | --------------------------- | ------------------------- | ------------------------- |
| **TypeScript SDK**        | Native             | Partial (JS-primary) | Native (AWS SDK v3)         | Types via DefinitelyTyped | Types via DefinitelyTyped |
| **React Email**           | Native (same team) | Render → pass HTML   | Render → pass HTML          | Render → pass HTML        | Render → pass HTML        |
| **Lines to send 1 email** | ~5                 | ~8                   | ~15                         | ~10                       | ~10                       |
| **Time to first send**    | Minutes            | Minutes              | Hours (sandbox exit)        | Minutes                   | Minutes                   |
| **Dashboard quality**     | Modern, clean      | Clean, focused       | AWS Console (complex)       | Feature-rich but dated    | Functional                |
| **Documentation**         | Excellent          | Excellent            | Comprehensive but AWS-style | Good                      | Good                      |

**Resend example (with React Email):**

```typescript
import { Resend } from "resend";
import { ConfirmationEmail } from "@mbe/email-templates";

const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: "reservations@mattbutlerengineering.com",
  to: guest.email,
  subject: "Reservation Confirmed",
  react: <ConfirmationEmail reservation={reservation} venue={venue} />,
});
```

**Postmark example (with React Email):**

```typescript
import { ServerClient } from "postmark";
import { render } from "@react-email/render";
import { ConfirmationEmail } from "@mbe/email-templates";

const client = new ServerClient(process.env.POSTMARK_API_TOKEN);
const html = await render(<ConfirmationEmail reservation={reservation} venue={venue} />);

await client.sendEmail({
  From: "reservations@mattbutlerengineering.com",
  To: guest.email,
  Subject: "Reservation Confirmed",
  HtmlBody: html,
});
```

**Amazon SES example (with React Email):**

```typescript
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { render } from "@react-email/render";
import { ConfirmationEmail } from "@mbe/email-templates";

const client = new SESv2Client({ region: "us-east-1" });
const html = await render(<ConfirmationEmail reservation={reservation} venue={venue} />);

await client.send(new SendEmailCommand({
  FromEmailAddress: "reservations@mattbutlerengineering.com",
  Destination: { ToAddresses: [guest.email] },
  Content: {
    Simple: {
      Subject: { Data: "Reservation Confirmed" },
      Body: { Html: { Data: html } },
    },
  },
}));
```

**Verdict:** Resend's React Email integration is uniquely seamless — no render step, React components passed directly. Postmark and SES require rendering to HTML first (a minor but real difference). SES has the most verbose API. For a TypeScript monorepo with React Email templates, Resend provides the most natural experience.

### 2. Deliverability

| Dimension                 | Resend                            | Postmark                    | Amazon SES           | SendGrid                          |
| ------------------------- | --------------------------------- | --------------------------- | -------------------- | --------------------------------- |
| **Inbox placement**       | Good                              | Best-in-class               | Good (with effort)   | Good                              |
| **Shared IP reputation**  | Good                              | Excellent (strict vetting)  | Varies               | Varies                            |
| **Dedicated IP**          | Enterprise only                   | $50/mo add-on               | $24.95/mo            | $30/mo (Pro+)                     |
| **SPF/DKIM/DMARC**        | Automatic setup guides            | Automatic setup guides      | Manual configuration | Automatic setup guides            |
| **Reputation management** | Managed by Resend                 | Managed by Postmark         | Self-managed         | Managed by SendGrid               |
| **Transactional focus**   | Yes (no marketing on same domain) | Strict (transactional only) | Any use case         | Mixed (transactional + marketing) |

**Verdict:** Postmark leads on deliverability due to strict transactional-only enforcement and IP reputation management. Resend is good and improving. SES requires you to manage your own reputation. For reservation confirmations (must reach inbox), Postmark and Resend are both strong; SES requires more operational investment.

### 3. Pricing Comparison

| Monthly Volume | Resend              | Postmark                | Amazon SES      | SendGrid              |
| -------------- | ------------------- | ----------------------- | --------------- | --------------------- |
| 100 emails     | $0 (free)           | $0 (free, 100/mo limit) | ~$0 (free tier) | $19.95 (no free tier) |
| 1,000 emails   | $0 (free)           | $15/mo (Basic)          | ~$0.10          | $19.95                |
| 3,000 emails   | $0 (free, at limit) | $15/mo                  | ~$0.30          | $19.95                |
| 10,000 emails  | $20/mo (Pro)        | $15/mo                  | ~$1.00          | $19.95                |
| 50,000 emails  | $20/mo (Pro)        | $15 + $60 overage       | ~$5.00          | $19.95                |
| 100,000 emails | $90/mo (Scale)      | $15 + $135 overage      | ~$10.00         | $89.95                |

**Realistic volume for this project:** A reservation system for a single venue might handle 50-500 reservations/month. With confirmation + reminder emails per reservation, plus Auth0 authentication emails, expect **200-2,000 emails/month** initially. All providers except Postmark's free tier comfortably handle this at $0/month.

**Verdict:** SES is cheapest at every volume. Resend's free tier (3,000/month) is the most generous for a developer-focused provider and covers the initial use case. Postmark's free tier (100/month) is inadequate for production. SendGrid requires paying from day one.

### 4. Auth0 Integration

All providers can integrate with Auth0 via the Custom Email Provider Action trigger. Auth0's June 2025 update limits tenants to one custom email provider action.

| Dimension              | Resend                       | Postmark                     | Amazon SES                        | SendGrid                                    |
| ---------------------- | ---------------------------- | ---------------------------- | --------------------------------- | ------------------------------------------- |
| **Integration method** | Auth0 Action (REST API call) | Auth0 Action (REST API call) | Auth0 Action (AWS SDK)            | Native dashboard integration + Auth0 Action |
| **Setup complexity**   | Low (API key + action)       | Low (API token + action)     | Medium (AWS credentials + action) | Lowest (dashboard config)                   |
| **Template control**   | Full (React Email in action) | Full (HTML in action)        | Full (HTML in action)             | Full (SendGrid templates or HTML)           |

**Verdict:** SendGrid has the simplest Auth0 integration (native dashboard support). Resend and Postmark are nearly identical in effort (one Auth0 Action + API key). SES requires AWS credential management. For this project, the Auth0 integration is a one-time setup that works identically across providers.

### 5. Company Stability

| Dimension                | Resend                                     | Postmark                                         | Amazon SES                               | SendGrid                                             |
| ------------------------ | ------------------------------------------ | ------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------- |
| **Founded**              | 2022                                       | 2010                                             | 2011                                     | 2009                                                 |
| **Ownership**            | Independent (VC-backed)                    | ActiveCampaign (acquired 2023)                   | Amazon (AWS)                             | Twilio (acquired 2019)                               |
| **Funding/Revenue**      | $21.5M raised; revenue undisclosed         | Part of ActiveCampaign                           | Part of AWS ($100B+ revenue)             | Part of Twilio (~$4B revenue)                        |
| **Employees**            | ~30                                        | ~30 (Postmark team within AC)                    | N/A (part of AWS)                        | N/A (part of Twilio)                                 |
| **Recent signals**       | Series A (Dec 2024); 147% headcount growth | SDK last release June 2024; uncertain investment | Stable; free tier restructured July 2025 | Free tier retired May 2025; Twilio layoffs 2022-2024 |
| **Discontinuation risk** | Medium (early-stage startup)               | Medium (acquisition deprioritization)            | Very low (AWS)                           | Low (Twilio) but degradation risk                    |
| **Migration difficulty** | Low (standard REST API)                    | Low (standard REST API)                          | Low (standard SDK)                       | Low (standard REST API)                              |

**Verdict:** SES has the lowest discontinuation risk (AWS). Resend is the youngest and most funding-dependent but shows healthy growth signals. Postmark's post-acquisition trajectory is uncertain. SendGrid is stable but showing signs of strategic neglect under Twilio. All four use standard APIs, so migration between them is straightforward.

---

## SMS Analysis

### Does This Project Need SMS?

**Short answer: Not yet.**

The reservation system has `requirePhone` and `guestPhone` fields, but the immediate needs are:

1. Auth0 MFA (if SMS-based MFA is enabled — currently not configured)
2. Reservation confirmations/reminders via SMS

For a solo developer launching a reservation platform, email covers the critical path. SMS adds complexity:

| SMS Consideration         | Impact                                                                        |
| ------------------------- | ----------------------------------------------------------------------------- |
| **10DLC registration**    | Required for US A2P SMS; $44 brand registration + $15/campaign + monthly fees |
| **Phone number rental**   | $1.15/mo minimum (Twilio local number)                                        |
| **Per-message cost**      | $0.0083/SMS (Twilio US) + $0.003 carrier fee                                  |
| **Regulatory compliance** | TCPA consent requirements; opt-in/opt-out management                          |
| **Delivery reliability**  | Carrier filtering, spam detection, number reputation                          |

**Recommendation:** Defer SMS to a separate evaluation when the feature is needed. Email-first for reservations; add SMS later as a premium venue feature.

### If SMS Is Needed Later

| Provider              | Per-SMS (US)             | Number Cost | 10DLC        | TypeScript SDK             | Notes                             |
| --------------------- | ------------------------ | ----------- | ------------ | -------------------------- | --------------------------------- |
| **Twilio**            | $0.0083 + $0.003 carrier | $1.15/mo    | Supported    | Yes (`twilio`)             | Market leader; most documentation |
| **Amazon SNS**        | $0.00645                 | $1.00/mo    | Via Pinpoint | Yes (AWS SDK v3)           | Cheapest; AWS ecosystem           |
| **Vonage** (Ericsson) | ~$0.0068                 | $0.90/mo    | Supported    | Yes (`@vonage/server-sdk`) | Acquired by Ericsson 2022         |

**When SMS becomes needed, Twilio is the default choice** — largest ecosystem, best documentation, most reliable delivery, and the most TypeScript community examples. Amazon SNS is cheaper but more complex (similar to SES vs. Resend for email).

---

## Comparison Tables

### Overall Scoring (Email Only)

| Criterion                   | Resend  | Postmark | Amazon SES | SendGrid | Mailgun |
| --------------------------- | ------- | -------- | ---------- | -------- | ------- |
| **Developer experience**    | 10/10   | 7/10     | 5/10       | 6/10     | 5/10    |
| **React Email integration** | 10/10   | 7/10     | 6/10       | 6/10     | 6/10    |
| **Deliverability**          | 8/10    | 10/10    | 7/10       | 7/10     | 7/10    |
| **Free tier generosity**    | 9/10    | 3/10     | 8/10       | 0/10     | 5/10    |
| **Pricing at scale**        | 7/10    | 6/10     | 10/10      | 7/10     | 6/10    |
| **Auth0 integration**       | 8/10    | 8/10     | 7/10       | 9/10     | 7/10    |
| **Company stability**       | 6/10    | 6/10     | 10/10      | 7/10     | 5/10    |
| **TypeScript SDK quality**  | 9/10    | 6/10     | 8/10       | 5/10     | 4/10    |
| **Solo developer fit**      | 9/10    | 7/10     | 5/10       | 5/10     | 5/10    |
| **Weighted total**          | **8.4** | **6.7**  | **7.3**    | **5.8**  | **5.3** |

### Pricing at Projected Volume

| Scenario                          | Monthly Emails | Resend | Postmark | Amazon SES |
| --------------------------------- | -------------- | ------ | -------- | ---------- |
| **Launch** (1 venue, low traffic) | ~500           | $0     | $15      | ~$0.05     |
| **Growing** (1 venue, moderate)   | ~2,000         | $0     | $15      | ~$0.20     |
| **Active** (multi-venue)          | ~10,000        | $20    | $15      | ~$1.00     |
| **Scaling** (many venues)         | ~50,000        | $20    | $75      | ~$5.00     |

---

## Eliminated Options

| Provider                        | Elimination Reason                                                                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SendGrid**                    | Free tier retired May 2025. No longer competitive for new projects. Twilio's strategic direction is uncertain (layoffs, cost-cutting). Legacy API design. |
| **Mailgun**                     | Flex plan price doubled December 2025. Free tier has 1-day data retention. Not a leader in any dimension. Ownership chain adds uncertainty.               |
| **Brevo** (formerly Sendinblue) | Marketing-first platform with email API bolted on. Transactional email is not the core product. Overkill for a developer-focused project.                 |
| **Mailtrap**                    | Testing-focused tool that added production sending. Good for development but less established for production transactional email.                         |
| **Loops**                       | Marketing automation platform. Not designed for transactional/triggered emails from application code.                                                     |

---

## Recommended Shortlist

### #1 Resend — Recommended

**Resend is the recommended email provider for this project.**

**Why Resend:**

1. **React Email integration is unmatched** — the same team built both tools. Email templates are React components in the TypeScript monorepo. No rendering step, no template language, no dashboard editor needed. `resend.emails.send({ react: <Component /> })` is the simplest API in the market.
2. **Free tier covers initial needs** — 3,000 emails/month handles a single-venue reservation system comfortably. No payment required until the project grows.
3. **TypeScript-native SDK** — first-class TypeScript types, not bolted-on `@types` definitions. Fits naturally into the monorepo alongside Fastify, Prisma, and React.
4. **Modern API design** — minimal, composable, well-documented. Time-to-first-send is minutes.
5. **$20/mo Pro plan is affordable** — when volume exceeds the free tier, the jump to 50,000 emails/month at $20/mo is reasonable.

**Risks and mitigations:**
| Risk | Mitigation |
|------|------------|
| **Young company (founded 2022)** | $21.5M funding, Series A, 147% headcount growth. Healthy signals. If Resend fails, email sending is a standard REST API — migration to any provider is 1-2 hours of work. |
| **2 req/s rate limit** | Batch API supports 100 emails/request. At 2 req/s × 100 emails = 200 emails/sec, far beyond this project's needs. |
| **No dedicated IP on free/Pro** | Shared IP deliverability is good for transactional email at low volume. Dedicated IP is rarely needed below 100K emails/month. |
| **Deliverability not #1** | Good, not Postmark-level. For reservation confirmations, shared IP reputation is adequate. Monitor bounce/complaint rates. |

**Implementation plan:**
| Step | Action | Effort |
|------|--------|--------|
| 1 | Create Resend account, verify `mattbutlerengineering.com` domain (SPF/DKIM/DMARC) | 30 min |
| 2 | Create `@mbe/email-templates` package with React Email components | 2-4 hours |
| 3 | Integrate Resend SDK into reservations service for confirmation/reminder emails | 2-4 hours |
| 4 | Configure Auth0 custom email provider Action to use Resend API | 1-2 hours |
| 5 | Add Resend webhook handling for bounce/complaint tracking | 1-2 hours |

### #2 Postmark — Best Alternative (Deliverability-First)

If deliverability is the primary concern (e.g., emails consistently going to spam):

1. **Best-in-class inbox placement** — strict transactional-only enforcement and IP reputation management
2. **Established track record** — 15+ years of transactional email focus
3. **Simple pricing** — $15/mo flat for 10,000 emails

**When to choose Postmark over Resend:**

- If deliverability testing shows Resend emails landing in spam
- If the project handles high-value reservations where missed emails have business impact
- If the ActiveCampaign acquisition results in continued investment rather than neglect

**Trade-offs:**

- $15/mo minimum (no meaningful free tier)
- React Email requires manual render step
- SDK is JavaScript-primary with TypeScript as secondary
- Post-acquisition maintenance velocity is uncertain

### #3 Amazon SES — Best Alternative (Cost-First)

If cost optimization is the primary concern at scale:

1. **$0.10/1,000 emails** — 4-15x cheaper than any competitor
2. **AWS SDK v3 is TypeScript-native** — good DX despite API verbosity
3. **Virtually unlimited scale** — no volume ceilings

**When to choose SES over Resend:**

- If email volume reaches 50,000+/month where Resend's $20-90/mo becomes significant
- If already invested in AWS infrastructure (not the case today — this project uses DigitalOcean)
- If willing to manage deliverability, reputation, and bounce handling manually

**Trade-offs:**

- Requires AWS account (the project currently uses DigitalOcean, not AWS)
- Significant operational overhead (sandbox exit, IP warm-up, reputation management)
- Verbose API requires more boilerplate
- No managed deliverability — you own your sending reputation

---

## Decision Matrix

| Scenario                                      | Recommended Action                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Current state** (0 emails, no provider)     | Set up Resend. Free tier covers initial needs.                                                             |
| **Launch** (<500 emails/month)                | Stay on Resend free tier. $0/mo.                                                                           |
| **Growing** (500-3,000 emails/month)          | Stay on Resend free tier. Monitor deliverability.                                                          |
| **Exceeding free tier** (3,000+ emails/month) | Upgrade to Resend Pro ($20/mo for 50K).                                                                    |
| **Deliverability issues**                     | Evaluate Postmark as alternative. Check SPF/DKIM/DMARC config first.                                       |
| **Cost pressure at volume** (50K+/month)      | Evaluate Amazon SES migration if $20-90/mo is significant.                                                 |
| **Need SMS**                                  | Add Twilio as a separate provider. Evaluate in dedicated SMS evaluation.                                   |
| **Resend company risk**                       | React Email templates are portable HTML. Switch to Postmark or SES with 1-2 hours of API integration work. |

---

## Re-Evaluation Triggers

1. **Resend pricing changes** — any reduction in free tier (currently 3,000/month) or significant price increases
2. **Resend company signals** — layoffs, reduced release cadence, acquisition, or funding concerns
3. **Deliverability problems** — if reservation confirmation emails consistently land in spam
4. **Volume exceeding 50K/month** — re-evaluate Resend vs SES cost trade-off
5. **SMS feature needed** — trigger dedicated SMS provider evaluation (Twilio vs alternatives)
6. **Postmark SDK revival** — if ActiveCampaign invests in modernizing the TypeScript SDK
7. **New entrants** — watch for providers that combine React Email integration with Postmark-level deliverability

---

## Sources

### Resend

- [Resend Pricing](https://resend.com/pricing)
- [Resend API Rate Limits](https://resend.com/docs/api-reference/rate-limit)
- [Resend Node.js SDK](https://resend.com/nodejs)
- [Resend New Free Tier Announcement](https://resend.com/blog/new-free-tier)
- [Resend New Features in 2025](https://resend.com/blog/new-features-in-2025)
- [React Email 5.0](https://resend.com/blog/react-email-5)
- [Resend Pricing Guide 2025 (Flexprice)](https://flexprice.io/blog/detailed-resend-pricing-guide)
- [Resend Pricing in 2026 (UserJot)](https://userjot.com/blog/resend-pricing-in-2025)
- [Resend Review 2025 (VIPEarner)](https://vipearner.com/blog/resend-review)
- [Resend Crunchbase Profile](https://www.crunchbase.com/organization/resend)
- [Developer-focused email platform Resend raises $3M (TechCrunch)](https://techcrunch.com/2023/07/18/developer-focused-email-platform-resend-raises-3m/)

### Postmark

- [Postmark Pricing](https://postmarkapp.com/pricing)
- [Postmark vs SendGrid Comparison](https://postmarkapp.com/compare/sendgrid-alternative)
- [Postmark Acquired by ActiveCampaign](https://postmarkapp.com/blog/postmark-and-dmarc-digests-acquired-by-activecampaign)
- [Postmark.js SDK (GitHub)](https://github.com/ActiveCampaign/postmark.js)
- [Postmark Review 2026 (Hackceleration)](https://hackceleration.com/postmark-review/)
- [Postmark Pricing Analysis 2026 (Sender.net)](https://www.sender.net/reviews/postmark/pricing/)
- [Postmark Pricing in 2026 (UserJot)](https://userjot.com/blog/postmark-pricing-in-2025)

### Amazon SES

- [Amazon SES Pricing](https://aws.amazon.com/ses/pricing/)
- [Amazon SES Pricing Calculator (CostGoat)](https://costgoat.com/pricing/amazon-ses)
- [Amazon SES Pricing 2026 (CampaignHQ)](https://blog.campaignhq.co/amazon-ses-pricing-2026)
- [AWS SDK for JavaScript v3 — SES Client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ses/)

### SendGrid

- [SendGrid Pricing](https://sendgrid.com/en-us/pricing)
- [SendGrid Free Plan Retirement (Twilio Changelog)](https://www.twilio.com/en-us/changelog/sendgrid-free-plan)
- [SendGrid Pricing Analysis (Sender.net)](https://www.sender.net/reviews/sendgrid/pricing/)

### Mailgun

- [Mailgun Pricing](https://www.mailgun.com/pricing/)
- [Mailgun Review 2026 (GMass)](https://www.gmass.co/blog/mailgun-review/)

### Auth0 Email/SMS Integration

- [Auth0 Custom Email Provider Configuration](https://auth0.com/docs/customize/email/smtp-email-providers/custom)
- [Auth0 SMS & MFA Providers Marketplace](https://marketplace.auth0.com/categories/sms-mfa)

### React Email

- [React Email](https://react.email)
- [React Email — Postmark Integration](https://react.email/docs/integrations/postmark)
- [React Email GitHub](https://github.com/resend/react-email)

### Comparisons & Reviews

- [Email SDKs in 2025: Who Comes Out on Top?](https://nuntly.com/blog/email-sdks-2025-who-comes-out-on-top)
- [Email API Pricing Comparison 2026 (BuildMVPFast)](https://www.buildmvpfast.com/api-costs/email)
- [13 Best Transactional Email Services 2026 (EmailToolTester)](https://www.emailtooltester.com/en/blog/best-transactional-email-service/)
- [Top 11 Transactional Email Services for Developers 2026 (Knock)](https://knock.app/blog/the-top-transactional-email-services-for-developers)
- [Resend vs Postmark: Developer Email Face-Off (Transmit)](https://xmit.sh/versus/resend-vs-postmark)
- [Resend vs SendGrid 2026 (DevPick)](https://www.devpick.io/blog/resend-vs-sendgrid-2026)

### SMS / Twilio

- [Twilio SMS Pricing (US)](https://www.twilio.com/en-us/sms/pricing/us)
- [Twilio Messaging Pricing](https://www.twilio.com/en-us/pricing/messaging)
- [Twilio 10DLC Pricing & Fees](https://help.twilio.com/articles/1260803965530-What-pricing-and-fees-are-associated-with-the-A2P-10DLC-service-)
- [Twilio 10DLC Overview](https://www.twilio.com/en-us/phone-numbers/a2p-10dlc)

### Notification Infrastructure

- [Push Notifications vs SMS 2026 (MobiLoud)](https://www.mobiloud.com/blog/push-notifications-vs-sms)
- [Best Notification Infrastructure Services (Resend Blog)](https://resend.com/blog/best-notification-infrastructure-services)
