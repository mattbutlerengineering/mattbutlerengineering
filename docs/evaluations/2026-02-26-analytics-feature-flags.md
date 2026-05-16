# Product Analytics & Feature Flags Evaluation — February 2026

## Current State

| Dimension | Value |
|-----------|-------|
| **Product analytics** | None |
| **Feature flags** | None |
| **User tracking** | Auth0 login events only |
| **A/B testing** | None |

### Why These Are Combined

PostHog provides both product analytics and feature flags in a single platform with a single free tier. Evaluating them separately would be redundant — the question is whether to use PostHog for both, or best-of-breed tools for each.

---

## Product Analytics

### Use Cases

1. **Dashboard usage patterns** — which features do venue operators use most?
2. **Booking funnel** — where do guests drop off in the reservation flow?
3. **Feature adoption** — are new features being discovered and used?
4. **Retention** — how often do venue operators return to the dashboard?

### Provider Comparison

| Dimension | PostHog | Plausible | Mixpanel |
|-----------|---------|-----------|---------|
| **Type** | Product analytics (full) | Web analytics (pageviews) | Product analytics (full) |
| **Free tier** | 1M events/month | None ($9/month min) | 1M events/month |
| **Event tracking** | Custom events, properties, user identification | Pageviews, goals, referrers | Custom events, properties, user profiles |
| **Funnels** | Yes | Business plan only ($19/mo) | Yes |
| **Session replay** | Yes (5,000/month free) | No | No |
| **Feature flags** | Yes (1M requests/month free) | No | Limited (experimental) |
| **A/B testing** | Yes (1M requests/month free) | No | Yes |
| **Self-hosted** | Yes (Docker, free) | Yes (Docker, free) | No |
| **Open source** | Yes (MIT) | Yes (AGPL) | No |
| **Privacy-focused** | Configurable | Yes (no cookies, GDPR-compliant) | No |
| **SDK** | `posthog-js` (browser) + `posthog-node` (server) | Script tag (no SDK needed) | `mixpanel-browser` + `mixpanel` (server) |

**Plausible eliminated:** Web analytics only (pageviews, referrers). No custom event tracking, no funnels, no user identification. Good for a marketing site but insufficient for product analytics on a dashboard application.

**Mixpanel eliminated:** No free feature flags. No session replay. Proprietary. PostHog matches Mixpanel on product analytics and adds feature flags, session replay, and A/B testing — all in the free tier.

---

## Feature Flags

### Use Cases

1. **Gradual feature rollout** — enable new features for specific venues before global launch
2. **Beta testing** — give early-access venues features before general availability
3. **Kill switches** — disable a feature without deploying if something goes wrong
4. **Configuration** — toggle venue-specific behaviors without code changes

### Provider Comparison

| Dimension | PostHog | LaunchDarkly | Flagsmith |
|-----------|---------|-------------|----------|
| **Free tier** | 1M requests/month | Free (limited MAU) | 50K requests/month |
| **Paid** | $0.0001/request after 1M | $10/seat/month + MAU charges | $45/month (1M requests) |
| **SDK** | `posthog-js` / `posthog-node` | `launchdarkly-node-server-sdk` | `flagsmith` |
| **Open source** | Yes (MIT) | No | Yes (BSD 3-Clause) |
| **Self-hosted** | Yes | No | Yes |
| **A/B testing** | Included | Included (Experimentation add-on) | Limited |
| **Analytics integration** | Native (same platform) | Requires separate analytics tool | Limited |

**LaunchDarkly eliminated:** Per-seat pricing + MAU charges. The free tier is restrictive. Overkill for a solo developer who needs basic feature toggles. LaunchDarkly is built for enterprises with dedicated feature management teams.

**Flagsmith is viable** but using a separate tool for feature flags when PostHog provides them alongside analytics (same SDK, same dashboard) adds unnecessary complexity.

---

## Recommendation: PostHog

**PostHog is the right choice — one platform for analytics, feature flags, session replay, and A/B testing.**

| Feature | Free Tier | Paid (if needed) |
|---------|-----------|-------------------|
| **Product analytics** | 1M events/month | $0.000248/event |
| **Session replay** | 5,000 recordings/month | $0.005/recording |
| **Feature flags** | 1M requests/month | $0.0001/request |
| **A/B testing** | 1M requests/month | $0.0001/request |
| **Surveys** | 250 responses/month | $0.20/response |

**Free tier math:** A reservation dashboard with 50 daily active users, ~100 events per user per day = ~150,000 events/month. Well within the 1M free tier.

**Implementation:**

| Step | Action | Effort |
|------|--------|--------|
| 1 | Create PostHog account (cloud) | 5 min |
| 2 | Add `posthog-js` to hospitality app | 30 min |
| 3 | Add `posthog-node` to Fastify services (server-side feature flags) | 1 hour |
| 4 | Define initial feature flags | 30 min |
| 5 | Add custom events for key user actions | 2-4 hours |

**Total:** ~4-6 hours. $0/month.

---

## Sources

- [PostHog Pricing](https://posthog.com/pricing)
- [PostHog vs Mixpanel](https://posthog.com/blog/posthog-vs-mixpanel)
- [PostHog vs LaunchDarkly](https://posthog.com/blog/posthog-vs-launchdarkly)
- [PostHog Open Source Analytics Tools](https://posthog.com/blog/best-open-source-analytics-tools)
- [Best Feature Flag Software (PostHog)](https://posthog.com/blog/best-feature-flag-software-for-developers)
- [LaunchDarkly Free Feature Flag Services](https://launchdarkly.com/blog/best-free-feature-flag-services/)
- [Feature Flag Tools Pricing (Unleash)](https://www.getunleash.io/blog/feature-flag-tools-which-should-you-use-with-pricing)
- [Flagsmith LaunchDarkly Alternatives](https://www.flagsmith.com/blog/launchdarkly-alternatives)
- [Plausible Alternatives (PostHog)](https://posthog.com/blog/best-plausible-alternatives)
