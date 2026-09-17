import test from "node:test";
import assert from "node:assert/strict";
import {
  Match13ApiError,
  Match13Client,
  buildEventMatchesPath,
  buildTeamEventsPath,
  buildTeamYearPath,
  isLikelyApiKey,
  isValidEventKey,
  isValidTeamNumber,
  supportedYears,
} from "../api.js";

function response(body, { status = 200, headers = {} } = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("builds documented Match 13 paths", () => {
  assert.equal(buildTeamYearPath(581, 2026), "/v1/teams/581/years/2026?scope=season");
  assert.equal(buildTeamEventsPath(581, 2026), "/v1/teams/581/years/2026/events?scope=season");
  assert.equal(buildEventMatchesPath("2026casj"), "/v1/events/2026casj/matches");
});

test("validates team, event, year, and key input", () => {
  assert.equal(isValidTeamNumber("581"), true);
  assert.equal(isValidTeamNumber("0"), false);
  assert.equal(isValidTeamNumber("10001"), false);
  assert.equal(isValidEventKey("2026casj_qm42"), true);
  assert.equal(isValidEventKey("casj"), false);
  assert.equal(isLikelyApiKey("m13_live_example_key"), true);
  assert.equal(isLikelyApiKey("not-a-key"), false);
  assert.deepEqual(supportedYears(2026).slice(0, 3), [2026, 2025, 2024]);
});

test("sends bearer authorization and returns JSON data", async () => {
  const calls = [];
  const client = new Match13Client({
    apiKey: "m13_live_test_key",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({ teamNumber: 581, year: 2026, xp: 81.8 }, { headers: { ETag: "team-v1" } });
    },
  });

  const data = await client.getTeamYear(581, 2026);
  assert.equal(data.xp, 81.8);
  assert.equal(calls[0].url, "https://actions.match13.com/v1/teams/581/years/2026?scope=season");
  assert.equal(calls[0].options.headers.Authorization, "Bearer m13_live_test_key");
});

test("deduplicates concurrent requests and reuses an ETag after 304", async () => {
  let callCount = 0;
  const client = new Match13Client({
    apiKey: "m13_live_test_key",
    fetchImpl: async (_url, options) => {
      callCount += 1;
      if (callCount === 1) return response({ eventKey: "2026casj", matches: [] }, { headers: { ETag: "event-v1" } });
      assert.equal(options.headers["If-None-Match"], "event-v1");
      return response(null, { status: 304 });
    },
  });

  const [first, second] = await Promise.all([
    client.getEventMatches("2026casj"),
    client.getEventMatches("2026casj"),
  ]);
  assert.deepEqual(first, second);
  assert.equal(callCount, 1);
  const third = await client.getEventMatches("2026casj");
  assert.deepEqual(third, first);
  assert.equal(callCount, 2);
});

test("surfaces problem details and retry-after", async () => {
  const client = new Match13Client({
    apiKey: "m13_live_test_key",
    fetchImpl: async () => response({ title: "Rate limited", detail: "Wait before retrying.", retryAfter: 12 }, { status: 429, headers: { "Retry-After": "12" } }),
  });

  await assert.rejects(
    client.getEventMatches("2026casj"),
    (error) => error instanceof Match13ApiError && error.status === 429 && error.retryAfter === 12 && error.detail === "Wait before retrying.",
  );
});

test("rejects missing keys before making a network request", async () => {
  let called = false;
  const client = new Match13Client({ fetchImpl: async () => { called = true; } });
  await assert.rejects(client.getTeamYear(581, 2026), (error) => error.status === 0 && error.title === "API key required");
  assert.equal(called, false);
});
