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
// One iteration below makes 2 requests into that shared bucket (users
// health, reservations health); marketing is a separate host and
// untouched by this limiter.
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
  // 10 iterations/min * 2 = 20 /api/* req/min — 20% of budget.
  smoke: {
    executor: "constant-arrival-rate",
    rate: 10,
    timeUnit: "1m",
    duration: "30s",
    preAllocatedVUs: 2,
    maxVUs: 5,
    tags: { type: "smoke" },
  },
  // Plateaus at 15 iterations/min * 2 = 30 /api/* req/min — 70% headroom
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
// unauthenticated 200s.
const EXPECTED_API_STATUS = {
  users_health: 200,
  reservations_health: 200,
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
 * response outside 200-399" — which would flag every intentional 429
 * (accepted during the `stress` scenario, see ALL_SCENARIOS.stress) as a
 * request failure. `http.expectedStatuses` tells k6 what this specific
 * request actually expects, so `http_req_failed` agrees with our own
 * `errors{endpoint:...}` check-derived metric instead of contradicting
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
  },
};

export default function () {
  requestsCounter.add(1);

  testMarketingHome();
  testUsersHealth();
  testReservationsHealth();

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
