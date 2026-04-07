import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const errorRate = new Rate("errors");
const apiLatency = new Trend("api_latency");
const requestsCounter = new Counter("total_requests");

const BASE_URL = __ENV.BASE_URL || "https://api.mattbutlerengineering.com";
const MARKETING_URL = __ENV.MARKETING_URL || "https://mattbutlerengineering.com";

export const options = {
  scenarios: {
    smoke: {
      executor: "constant-vus",
      vus: 1,
      duration: "30s",
      tags: { type: "smoke" },
    },
    load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "1m", target: 50 },
        { duration: "30s", target: 0 },
      ],
      tags: { type: "load" },
    },
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
  },
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.05"],
    errors: ["rate<0.1"],
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
  const res = http.get(`${BASE_URL}/api/v1/users/health`, {
    tags: { name: "users_health" },
  });

  apiLatency.add(res.timings.duration, { endpoint: "users_health" });

  const success = check(res, {
    "users health returns 200": (r) => r.status === 200,
    "users health has status": (r) => r.json("status") !== undefined,
  });

  errorRate.add(!success, { endpoint: "users_health" });
}

function testReservationsHealth() {
  const res = http.get(`${BASE_URL}/api/v1/reservations/health`, {
    tags: { name: "reservations_health" },
  });

  apiLatency.add(res.timings.duration, { endpoint: "reservations_health" });

  const success = check(res, {
    "reservations health returns 200": (r) => r.status === 200,
    "reservations health has status": (r) => r.json("status") !== undefined,
  });

  errorRate.add(!success, { endpoint: "reservations_health" });
}

function testPublicEndpoints() {
  const venuesRes = http.get(`${BASE_URL}/api/v1/venues`, {
    tags: { name: "venues_list" },
    params: { page: "1", limit: "10" },
  });

  apiLatency.add(venuesRes.timings.duration, { endpoint: "venues_list" });

  const venuesSuccess = check(venuesRes, {
    "venues list responds": (r) => r.status >= 200 && r.status < 500,
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

  const availabilityRes = http.get(`${BASE_URL}/api/v1/availability/test-venue`, {
    tags: { name: "availability_check" },
    params: {
      date: "2026-04-15",
      partySize: "2",
    },
  });

  apiLatency.add(availabilityRes.timings.duration, { endpoint: "availability_check" });

  const availabilitySuccess = check(availabilityRes, {
    "availability check responds": (r) => r.status >= 200 && r.status < 500,
  });
  errorRate.add(!availabilitySuccess, { endpoint: "availability_check" });

  const eventsRes = http.get(`${BASE_URL}/api/v1/events`, {
    tags: { name: "events_list" },
    params: { page: "1", limit: "10" },
  });

  apiLatency.add(eventsRes.timings.duration, { endpoint: "events_list" });

  const eventsSuccess = check(eventsRes, {
    "events list responds": (r) => r.status >= 200 && r.status < 500,
  });
  errorRate.add(!eventsSuccess, { endpoint: "events_list" });
}