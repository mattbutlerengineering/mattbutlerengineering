import http from "k6/http";
import { check, sleep } from "k6";
import { scenario as currentScenario } from "k6/execution";
import { Rate, Trend, Counter } from "k6/metrics";
import { selectScenarios } from "../../scripts/load-test-scenario.mjs";

const errorRate = new Rate("errors");
const apiLatency = new Trend("api_latency");
const requestsCounter = new Counter("total_requests");

const BASE_URL = __ENV.BASE_URL || "https://api.mattbutlerengineering.com";
const MARKETING_URL = __ENV.MARKETING_URL || "https://mattbutlerengineering.com";

// k6 has no CLI flag to run a single named scenario — `--tag` only labels
// metrics, it doesn't filter execution (see #3682). Filter here instead,
// driven by the K6_SCENARIO env var the workflow sets from its `scenario`
// input. Falls back to running every scenario when unset/unknown.
//
// The edge Worker rate-limits every /api/* path to 100 req/60s per IP,
// shared across ALL of them — see infrastructure/worker/rate-limiter.js.
// One iteration below makes 5 requests into that shared bucket (users
// health, reservations health, venues, availability, events); marketing
// is a separate host and untouched by this limiter.
//
// `smoke` and `load` are sized (see #4108) so their aggregate /api/*
// request rate stays under the edge's 100 req/60s-per-IP budget — a
// `ramping-vus`/`constant-vus` executor can't bound that: an executor's
// `vus`/`stages` cap concurrency, not the aggregate request rate a CI
// runner's single IP produces, so more VUs just meant more concurrent
// 429s, not more real backend traffic (the original bug: p95 ~125ms on
// "failed" endpoints, because the edge answered instantly with 429).
// `ramping-arrival-rate`/`constant-arrival-rate` instead hold *iteration*
// rate steady regardless of how many VUs k6 allocates to sustain it, so
// the request-rate math below is exact rather than an estimate.
const ALL_SCENARIOS = {
  // 10 iterations/min * 5 = 50 /api/* req/min — 50% of budget.
  smoke: {
    executor: "constant-arrival-rate",
    rate: 10,
    timeUnit: "1m",
    duration: "30s",
    preAllocatedVUs: 2,
    maxVUs: 5,
    tags: { type: "smoke" },
  },
  // Plateaus at 15 iterations/min * 5 = 75 /api/* req/min — 25% headroom
  // under the 100 req/60s budget. This is the scenario the weekly
  // scheduled run and the workflow's default execute, so it gets the
  // widest margin.
  load: {
    executor: "ramping-arrival-rate",
    startRate: 0,
    timeUnit: "1m",
    stages: [
      { duration: "30s", target: 8 },
      { duration: "1m", target: 15 },
      { duration: "30s", target: 0 },
    ],
    preAllocatedVUs: 5,
    maxVUs: 10,
    tags: { type: "load" },
  },
  // Deliberately drives traffic well past the edge rate limiter's budget.
  // This is the "the rate limiter itself is under test" scenario: its
  // checks (isExpectedApiStatus below) accept 429 as a pass — the point
  // of `stress` is confirming the edge sheds excess load with a
  // controlled 429 instead of the backend degrading or 5xx-ing under the
  // burst. Not run in CI; workflow_dispatch only.
  stress: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: "1m", target: 100 },
      { duration: "2m", target: 200 },
      { duration: "30s", target: 0 },
    ],
    tags: { type: "stress" },
  },
};

// The status each endpoint deterministically returns today when NOT
// throttled by the edge — verified live against production (see #4108
// PR body). `users_health`/`reservations_health` are genuinely
// unauthenticated 200s. `venues_list` and `availability_check` hit
// admin/auth-gated routes (services/reservations/src/routes/venues.ts,
// availability.ts: `preHandler: requireAuth`) with no credentials, so
// 401 is the correct expectation, not a defect this test should paper
// over — it also means this check doubles as an auth-regression canary
// (a 200 here would mean the endpoint went unintentionally public).
// `events_list` hits a route reservations-api never registers (only
// only /api/v1/events/stream and a dev-only /api/v1/events/test exist) —
// tracked as a follow-up to point it at something real; 404 is what the
// path being called actually, deterministically returns.
const EXPECTED_API_STATUS = {
  users_health: 200,
  reservations_health: 200,
  venues_list: 401,
  availability_check: 401,
  events_list: 404,
};

/**
 * Status codes honestly expected for `endpoint` under the active
 * scenario's load model. `smoke`/`load` stay under the edge rate-limit
 * budget by design, so EXPECTED_API_STATUS is the only honest
 * expectation — a 429 there is a real capacity failure. `stress`
 * deliberately exceeds the budget, so 429 is also expected there (see
 * ALL_SCENARIOS.stress).
 */
function expectedStatusesFor(endpoint) {
  const expected = [EXPECTED_API_STATUS[endpoint]];
  if (currentScenario.name === "stress") {
    expected.push(429);
  }
  return expected;
}

function isExpectedApiStatus(endpoint, status) {
  return expectedStatusesFor(endpoint).includes(status);
}

/**
 * k6 classifies the built-in `http_req_failed` metric by default as "any
 * response outside 200-399" — which would flag every intentional 401/404
 * above as a request failure. `http.expectedStatuses` tells k6 what this
 * specific request actually expects, so `http_req_failed` agrees with our
 * own `errors{endpoint:...}` check-derived metric instead of contradicting
 * it. Returns k6 http.get() params for a given /api/* endpoint.
 */
function apiRequestParams(endpoint) {
  return {
    tags: { name: endpoint },
    responseCallback: http.expectedStatuses(...expectedStatusesFor(endpoint)),
  };
}

export const options = {
  scenarios: selectScenarios(ALL_SCENARIOS, __ENV.K6_SCENARIO),
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.05"],
    errors: ["rate<0.1"],
    // Per-endpoint submetrics (k6 sub-metric syntax: metric{tag:value}).
    // scripts/load-test-summary.mjs reads these — plus their pass/fail
    // counts — from the k6 JSON summary to derive a real per-endpoint
    // status instead of a hardcoded "tested" literal.
    "api_latency{endpoint:marketing_home}": ["p(95)<3000"],
    "errors{endpoint:marketing_home}": ["rate<0.1"],
    "api_latency{endpoint:users_health}": ["p(95)<800"],
    "errors{endpoint:users_health}": ["rate<0.1"],
    "api_latency{endpoint:reservations_health}": ["p(95)<800"],
    "errors{endpoint:reservations_health}": ["rate<0.1"],
    "api_latency{endpoint:venues_list}": ["p(95)<1500"],
    "errors{endpoint:venues_list}": ["rate<0.1"],
    "api_latency{endpoint:availability_check}": ["p(95)<1500"],
    "errors{endpoint:availability_check}": ["rate<0.1"],
    "api_latency{endpoint:events_list}": ["p(95)<1500"],
    "errors{endpoint:events_list}": ["rate<0.1"],
  },
};

export default function () {
  requestsCounter.add(1);

  testMarketingHome();
  testUsersHealth();
  testReservationsHealth();
  testPublicEndpoints();

  sleep(1);
}

function testMarketingHome() {
  const res = http.get(MARKETING_URL, {
    tags: { name: "marketing_home" },
  });

  apiLatency.add(res.timings.duration, { endpoint: "marketing_home" });

  const success = check(res, {
    "marketing homepage loads": (r) => r.status === 200,
    "marketing has content": (r) => r.body.length > 1000,
  });

  errorRate.add(!success, { endpoint: "marketing_home" });
}

function testUsersHealth() {
  const res = http.get(`${BASE_URL}/api/v1/users/health`, apiRequestParams("users_health"));

  apiLatency.add(res.timings.duration, { endpoint: "users_health" });

  const success = check(res, {
    "users health returns expected status": (r) => isExpectedApiStatus("users_health", r.status),
    // A 429 body has no "status" field — only require one on an actual 200.
    "users health has status when 200": (r) => r.status !== 200 || r.json("status") !== undefined,
  });

  errorRate.add(!success, { endpoint: "users_health" });
}

function testReservationsHealth() {
  const res = http.get(
    `${BASE_URL}/api/v1/reservations/health`,
    apiRequestParams("reservations_health")
  );

  apiLatency.add(res.timings.duration, { endpoint: "reservations_health" });

  const success = check(res, {
    "reservations health returns expected status": (r) =>
      isExpectedApiStatus("reservations_health", r.status),
    // A 429 body has no "status" field — only require one on an actual 200.
    "reservations health has status when 200": (r) =>
      r.status !== 200 || r.json("status") !== undefined,
  });

  errorRate.add(!success, { endpoint: "reservations_health" });
}

function testPublicEndpoints() {
  // k6's http.get(url, params) second argument is RequestParams (headers,
  // tags, cookies, …) — it has no query-string mechanism, so a `params:`
  // key holding query values (as all three calls below used to) is
  // silently ignored, not appended to the URL. Confirmed live: without
  // this fix, `availability_check`'s required `date` query param never
  // reached the request, so it 400'd on schema validation instead of
  // 401'ing on auth like `venues_list` — the query string is built into
  // the URL directly below instead.
  const venuesRes = http.get(
    `${BASE_URL}/api/v1/venues?page=1&limit=10`,
    apiRequestParams("venues_list")
  );

  apiLatency.add(venuesRes.timings.duration, { endpoint: "venues_list" });

  const venuesSuccess = check(venuesRes, {
    "venues list returns expected status": (r) => isExpectedApiStatus("venues_list", r.status),
    "venues valid JSON": (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
  });
  errorRate.add(!venuesSuccess, { endpoint: "venues_list" });

  const availabilityRes = http.get(
    `${BASE_URL}/api/v1/availability/test-venue?date=2026-04-15&partySize=2`,
    apiRequestParams("availability_check")
  );

  apiLatency.add(availabilityRes.timings.duration, { endpoint: "availability_check" });

  const availabilitySuccess = check(availabilityRes, {
    "availability check returns expected status": (r) =>
      isExpectedApiStatus("availability_check", r.status),
  });
  errorRate.add(!availabilitySuccess, { endpoint: "availability_check" });

  const eventsRes = http.get(
    `${BASE_URL}/api/v1/events?page=1&limit=10`,
    apiRequestParams("events_list")
  );

  apiLatency.add(eventsRes.timings.duration, { endpoint: "events_list" });

  const eventsSuccess = check(eventsRes, {
    "events list returns expected status": (r) => isExpectedApiStatus("events_list", r.status),
  });
  errorRate.add(!eventsSuccess, { endpoint: "events_list" });
}
