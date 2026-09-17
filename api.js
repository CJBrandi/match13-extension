export const API_BASE_URL = "https://actions.match13.com";
export const MIN_TEAM_NUMBER = 1;
export const MAX_TEAM_NUMBER = 10000;
export const MIN_YEAR = 2002;
export const DEFAULT_SCOPE = "season";

const EVENT_KEY_PATTERN = /^\d{4}[a-z0-9_-]+$/;
const API_KEY_PATTERN = /^m13_[A-Za-z0-9_-]+$/;

export class Match13ApiError extends Error {
  constructor({ status = 0, title = "Request failed", detail = "The request could not be completed.", retryAfter = null }) {
    super(detail);
    this.name = "Match13ApiError";
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.retryAfter = retryAfter;
  }
}

export function isValidTeamNumber(team) {
  const value = Number(team);
  return Number.isInteger(value) && value >= MIN_TEAM_NUMBER && value <= MAX_TEAM_NUMBER;
}

export function isValidYear(year) {
  const value = Number(year);
  return Number.isInteger(value) && value >= MIN_YEAR && value <= new Date().getFullYear();
}

export function isValidEventKey(eventKey) {
  return typeof eventKey === "string" && EVENT_KEY_PATTERN.test(eventKey.trim());
}

export function isLikelyApiKey(apiKey) {
  return typeof apiKey === "string" && API_KEY_PATTERN.test(apiKey.trim());
}

export function supportedYears(currentYear = new Date().getFullYear()) {
  const lastYear = Math.max(MIN_YEAR, Number(currentYear));
  return Array.from({ length: lastYear - MIN_YEAR + 1 }, (_, index) => lastYear - index);
}

function assertTeamAndYear(team, year) {
  if (!isValidTeamNumber(team)) {
    throw new Match13ApiError({ status: 422, title: "Invalid team", detail: "Team number must be an integer from 1 to 10000." });
  }
  if (!isValidYear(year)) {
    throw new Match13ApiError({ status: 422, title: "Invalid year", detail: "Choose a supported season year." });
  }
}

export function buildTeamYearPath(team, year) {
  assertTeamAndYear(team, year);
  return `/v1/teams/${Number(team)}/years/${Number(year)}?scope=${DEFAULT_SCOPE}`;
}

export function buildTeamEventsPath(team, year) {
  assertTeamAndYear(team, year);
  return `/v1/teams/${Number(team)}/years/${Number(year)}/events?scope=${DEFAULT_SCOPE}`;
}

export function buildEventMatchesPath(eventKey) {
  if (!isValidEventKey(eventKey)) {
    throw new Match13ApiError({ status: 422, title: "Invalid event key", detail: "Event keys look like 2026casj or 2026casj_qm42." });
  }
  return `/v1/events/${encodeURIComponent(eventKey.trim())}/matches`;
}

async function readProblem(response) {
  let problem = {};
  try {
    problem = await response.json();
  } catch {
    problem = {};
  }

  const retryHeader = response.headers?.get("Retry-After");
  const retryAfter = Number.isFinite(Number(retryHeader)) ? Number(retryHeader) : problem.retryAfter ?? null;
  return new Match13ApiError({
    status: response.status,
    title: problem.title || response.statusText || "Request failed",
    detail: problem.detail || "Match 13 did not return a usable response.",
    retryAfter,
  });
}

export class Match13Client {
  constructor({ apiKey = "", fetchImpl = globalThis.fetch, baseUrl = API_BASE_URL } = {}) {
    this.apiKey = apiKey.trim();
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.cache = new Map();
    this.inflight = new Map();
  }

  setApiKey(apiKey) {
    this.apiKey = apiKey.trim();
    this.cache.clear();
  }

  async request(path) {
    if (!this.apiKey) {
      throw new Match13ApiError({ status: 0, title: "API key required", detail: "Add a Match 13 API key on the startup screen." });
    }
    if (this.inflight.has(path)) {
      return this.inflight.get(path);
    }

    const requestPromise = this.#requestUncached(path);
    this.inflight.set(path, requestPromise);
    try {
      return await requestPromise;
    } finally {
      this.inflight.delete(path);
    }
  }

  async #requestUncached(path) {
    const cached = this.cache.get(path);
    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (cached?.etag) {
      headers["If-None-Match"] = cached.etag;
    }

    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, { headers });
    } catch {
      throw new Match13ApiError({ status: 0, title: "Network error", detail: "Could not reach actions.match13.com. Check your connection and try again." });
    }

    if (response.status === 304 && cached) {
      return cached.data;
    }
    if (!response.ok) {
      throw await readProblem(response);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Match13ApiError({ status: response.status, title: "Invalid response", detail: "Match 13 returned data that could not be read." });
    }
    this.cache.set(path, { data, etag: response.headers?.get("ETag") || null });
    return data;
  }

  getTeamYear(team, year) {
    return this.request(buildTeamYearPath(team, year));
  }

  getTeamEvents(team, year) {
    return this.request(buildTeamEventsPath(team, year));
  }

  getEventMatches(eventKey) {
    return this.request(buildEventMatchesPath(eventKey));
  }
}
