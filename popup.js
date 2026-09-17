import {
  Match13ApiError,
  Match13Client,
  isLikelyApiKey,
  isValidEventKey,
  isValidTeamNumber,
  supportedYears,
} from "./api.js";

const browserApi = globalThis.browser ?? globalThis.chrome;
const KEY_STORAGE_NAME = "match13ApiKey";
const currentYear = new Date().getFullYear();

const state = {
  apiKey: "",
  client: null,
  team: null,
  year: currentYear,
  activeTab: "stats",
  teamYear: null,
  teamEvents: null,
  selectedEventKey: "",
  eventMatches: null,
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function numeric(value, digits = 1) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
}

function percent(value, digits = 0) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(digits)}%` : "—";
}

function percentile(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}th` : "—";
}

function setStatus(element, message = "", kind = "") {
  element.textContent = message;
  element.className = `status ${kind}`.trim();
}

async function fetchViaBackground(url) {
  const parsedUrl = new URL(url);
  let result;
  try {
    result = await browserApi.runtime.sendMessage({
      type: "match13-api-request",
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
    });
  } catch (error) {
    throw new Match13ApiError({
      status: 0,
      title: "Background request error",
      detail: error?.message || "Firefox could not contact the Match 13 request worker.",
    });
  }
  if (result?.ok) {
    return new Response(JSON.stringify(result.data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const error = result?.error ?? {
    status: 0,
    title: "Background request error",
    detail: "Firefox could not contact the Match 13 request worker.",
  };
  if (!Number.isInteger(error.status) || error.status < 200 || error.status > 599) {
    throw new Match13ApiError({
      status: 0,
      title: error.title,
      detail: error.detail,
      retryAfter: error.retryAfter ?? null,
    });
  }
  const headers = { "Content-Type": "application/problem+json" };
  if (error.retryAfter !== null && error.retryAfter !== undefined) headers["Retry-After"] = String(error.retryAfter);
  return new Response(JSON.stringify(error), { status: error.status, headers });
}

function errorMessage(error) {
  if (!(error instanceof Match13ApiError)) {
    return "Something went wrong. Try again.";
  }
  if (error.status === 401) return "That API key was rejected. Use Change API key to replace it.";
  if (error.status === 404) return "Match 13 has no data for that team, year, or event.";
  if (error.status === 422) return error.detail;
  if (error.status === 429) {
    const wait = Number.isFinite(Number(error.retryAfter)) ? ` Try again in ${error.retryAfter} seconds.` : " Wait a moment, then try again.";
    return `Match 13 rate limit reached.${wait}`;
  }
  return error.detail;
}

function showSetup() {
  $("setup-view").hidden = false;
  $("dashboard-view").hidden = true;
  $("header-change-key").hidden = true;
  $("key-setup").hidden = Boolean(state.apiKey);
  $("team-setup").hidden = !state.apiKey;
  if (state.apiKey) $("setup-team").focus();
  else $("api-key-input").focus();
}

function showDashboard() {
  $("setup-view").hidden = true;
  $("dashboard-view").hidden = false;
  $("header-change-key").hidden = false;
  $("team-input").value = state.team;
  $("year-select").value = String(state.year);
  switchTab(state.activeTab);
}

function renderYearOptions() {
  $("year-select").innerHTML = supportedYears().map((year) => `<option value="${year}">${year}</option>`).join("");
  $("year-select").value = String(state.year);
}

function renderStatsLoading() {
  $("stats-content").innerHTML = `
    <div class="skeleton" style="width: 28%; margin-top: 16px"></div>
    <div class="skeleton" style="width: 54%; margin-top: 8px"></div>
    <div class="skeleton-grid"><div class="skeleton" style="height: 64px"></div><div class="skeleton" style="height: 64px"></div><div class="skeleton" style="height: 64px"></div><div class="skeleton" style="height: 64px"></div></div>
    <div class="skeleton" style="width: 32%; margin-top: 24px"></div>
    <div class="skeleton" style="height: 140px; margin-top: 8px"></div>`;
}

function metricCard(label, value) {
  return `<div class="metric-card"><div class="metric-label">${label}</div><div class="metric-value">${value}</div></div>`;
}

function renderStats() {
  const data = state.teamYear;
  if (!data) return;
  const metrics = [
    ["Auto", numeric(data.xAuto)],
    ["Teleop", numeric(data.xTele)],
    ["Endgame", numeric(data.xEnd)],
    ["Variance", numeric(data.xVar)],
    ["RP 1", percent(data.xRp1)],
    ["RP 2", percent(data.xRp2)],
    ["RP 3", percent(data.xRp3)],
    ["Norm xP", numeric(data.normXp)],
  ];

  const events = state.teamEvents?.events ?? [];
  const eventRows = events.length
    ? events.slice().reverse().map((event) => `
      <tr>
        <td class="event-cell">${escapeHtml(event.eventKey)}</td>
        <td>${numeric(event.xpStart)}</td>
        <td>${numeric(event.xpMean)}</td>
        <td>${numeric(event.xpMax)}</td>
        <td>${numeric(event.xpEnd)}</td>
        <td>${numeric(event.epa)}</td>
      </tr>`).join("")
    : `<tr><td colspan="6">No event history for this team and year.</td></tr>`;

  $("stats-content").innerHTML = `
    <div class="section-heading"><h2>Team ${escapeHtml(state.team)}</h2><span>${escapeHtml(state.year)}</span></div>
    <div class="summary-card">
      <div class="summary-item primary"><div class="summary-label">xP rating</div><div class="summary-value">${numeric(data.xp)}</div></div>
      <div class="summary-item"><div class="summary-label">Rank</div><div class="summary-value">${data.rank ? `#${escapeHtml(data.rank)}` : "—"}</div></div>
      <div class="summary-item"><div class="summary-label">Percentile</div><div class="summary-value">${percentile(data.percentile)}</div></div>
      <div class="summary-item"><div class="summary-label">EPA</div><div class="summary-value">${numeric(data.epa)}</div></div>
    </div>
    <div class="metrics-grid" style="margin-top: 9px">${metrics.map(([label, value]) => metricCard(label, value)).join("")}</div>
    <div class="section-heading"><h2>Event history</h2><span>${events.length ? `${events.length} event${events.length === 1 ? "" : "s"}` : "No events"}</span></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Event</th><th>xP in</th><th>Mean</th><th>Peak</th><th>xP out</th><th>EPA</th></tr></thead>
        <tbody>${eventRows}</tbody>
      </table>
    </div>`;
}

function renderEventOptions() {
  const events = state.teamEvents?.events ?? [];
  const options = events.slice().reverse().map((event) => `<option value="${escapeHtml(event.eventKey)}">${escapeHtml(event.eventKey)}</option>`).join("");
  $("event-select").innerHTML = `<option value="">Choose an event</option>${options}`;
  if (state.selectedEventKey && events.some((event) => event.eventKey === state.selectedEventKey)) {
    $("event-select").value = state.selectedEventKey;
  }
}

function formatMatchLabel(matchKey) {
  const suffix = String(matchKey).split("_").pop() || matchKey;
  const finals = suffix.match(/^f(\d+)m(\d+)$/i);
  const bracket = suffix.match(/^(qf|sf)(\d+)m(\d+)$/i);
  const qualification = suffix.match(/^qm(\d+)$/i);
  if (finals) return `Final ${finals[1]} · Match ${finals[2]}`;
  if (bracket) return `${bracket[1].toUpperCase()} ${bracket[2]} · Match ${bracket[3]}`;
  if (qualification) return `Qual ${qualification[1]}`;
  return suffix.toUpperCase();
}

function renderTeamRatings(teams = {}) {
  const entries = Object.entries(teams).sort(([left], [right]) => Number(left) - Number(right));
  if (!entries.length) return "—";
  return `<details><summary>${entries.length} team rating${entries.length === 1 ? "" : "s"}</summary>
    <table class="mini-table"><thead><tr><th>Team</th><th>xP before</th><th>xP after</th></tr></thead><tbody>
      ${entries.map(([team, values]) => `<tr><td>${escapeHtml(team)}</td><td>${numeric(values.xpPre)}</td><td>${numeric(values.xpPost)}</td></tr>`).join("")}
    </tbody></table></details>`;
}

function renderMatches() {
  const matches = state.eventMatches?.matches ?? [];
  if (!state.selectedEventKey) {
    $("matches-content").innerHTML = `<div class="empty-state">Choose an event above to browse Match 13 forecasts.</div>`;
    return;
  }
  if (!matches.length) {
    $("matches-content").innerHTML = `<div class="empty-state">No matches are available for ${escapeHtml(state.selectedEventKey)}.</div>`;
    return;
  }
  const rows = matches.map((match) => `
    <tr>
      <td><div class="match-type">${escapeHtml(formatMatchLabel(match.key))}</div><div class="muted">${escapeHtml(match.key)}</div></td>
      <td class="score red-text">${numeric(match.pred?.redScore)}</td>
      <td class="score blue-text">${numeric(match.pred?.blueScore)}</td>
      <td class="probability">${percent(match.pred?.winProb)}</td>
      <td>${renderTeamRatings(match.teams)}</td>
    </tr>`).join("");
  $("matches-content").innerHTML = `
    <div class="section-heading"><h2>${escapeHtml(state.selectedEventKey)}</h2><span>${matches.length} forecast${matches.length === 1 ? "" : "s"}</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Match</th><th class="red-text">Red pred.</th><th class="blue-text">Blue pred.</th><th>Red win</th><th>Ratings</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

async function loadMatches(eventKey) {
  if (!isValidEventKey(eventKey)) {
    setStatus($("matches-status"), "Enter an event key like 2026casj.", "error");
    return;
  }
  state.selectedEventKey = eventKey.trim();
  $("event-select").value = state.selectedEventKey;
  setStatus($("matches-status"), "Loading forecasts…", "loading");
  $("matches-content").innerHTML = `<div class="skeleton" style="height: 190px; margin-top: 16px"></div>`;
  try {
    state.eventMatches = await state.client.getEventMatches(state.selectedEventKey);
    setStatus($("matches-status"));
    renderMatches();
  } catch (error) {
    state.eventMatches = null;
    setStatus($("matches-status"), errorMessage(error), "error");
    $("matches-content").innerHTML = `<div class="empty-state">Could not load ${escapeHtml(state.selectedEventKey)}.</div>`;
  }
}

async function loadTeam(team, year = state.year, { fromSetup = false } = {}) {
  const cleanTeam = String(team).trim();
  if (!isValidTeamNumber(cleanTeam)) {
    setStatus(fromSetup ? $("setup-status") : $("stats-status"), "Enter a team number from 1 to 10000.", "error");
    return;
  }
  if (!state.apiKey) {
    setStatus(fromSetup ? $("setup-status") : $("stats-status"), "Add your Match 13 API key on the startup screen first.", "error");
    return;
  }

  const statusElement = fromSetup ? $("setup-status") : $("stats-status");
  setStatus(statusElement, `Loading team ${cleanTeam}…`, "loading");
  if (!fromSetup) renderStatsLoading();
  try {
    const [teamResult, eventsResult] = await Promise.allSettled([
      state.client.getTeamYear(Number(cleanTeam), Number(year)),
      state.client.getTeamEvents(Number(cleanTeam), Number(year)),
    ]);
    if (teamResult.status === "rejected") throw teamResult.reason;
    state.team = Number(cleanTeam);
    state.year = Number(year);
    state.teamYear = teamResult.value;
    state.teamEvents = eventsResult.status === "fulfilled" ? eventsResult.value : { events: [] };
    state.selectedEventKey = "";
    state.eventMatches = null;
    setStatus(statusElement);
    showDashboard();
    renderStats();
    renderEventOptions();
    if (eventsResult.status === "rejected" && eventsResult.reason?.status !== 404) {
      setStatus($("stats-status"), `Team stats loaded. Event history unavailable: ${errorMessage(eventsResult.reason)}`, "error");
    }
  } catch (error) {
    setStatus(statusElement, errorMessage(error), "error");
    if (!fromSetup) {
      state.teamYear = null;
      $("stats-content").innerHTML = `<div class="empty-state">Could not load this team and year.</div>`;
    }
  }
}

function switchTab(tab) {
  state.activeTab = tab;
  const statsActive = tab === "stats";
  $("stats-tab").classList.toggle("active", statsActive);
  $("matches-tab").classList.toggle("active", !statsActive);
  $("stats-tab").setAttribute("aria-selected", String(statsActive));
  $("matches-tab").setAttribute("aria-selected", String(!statsActive));
  $("stats-panel").hidden = !statsActive;
  $("matches-panel").hidden = statsActive;
  if (!statsActive) {
    renderEventOptions();
    if (state.selectedEventKey && !state.eventMatches) loadMatches(state.selectedEventKey);
    else renderMatches();
  }
}

async function loadStoredKey() {
  if (!browserApi?.storage?.local) return "";
  const stored = await browserApi.storage.local.get(KEY_STORAGE_NAME);
  return typeof stored[KEY_STORAGE_NAME] === "string" ? stored[KEY_STORAGE_NAME].trim() : "";
}

function wireEvents() {
  $("key-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const apiKey = $("api-key-input").value.trim();
    if (!isLikelyApiKey(apiKey)) {
      setStatus($("setup-status"), "Enter a Match 13 key beginning with m13_.", "error");
      return;
    }
    await browserApi.storage.local.set({ [KEY_STORAGE_NAME]: apiKey });
    state.apiKey = apiKey;
    state.client.setApiKey(apiKey);
    $("api-key-input").value = "";
    setStatus($("setup-status"));
    showSetup();
  });
  $("setup-form").addEventListener("submit", (event) => {
    event.preventDefault();
    loadTeam($("setup-team").value, currentYear, { fromSetup: true });
  });
  const beginKeyChange = () => {
    state.apiKey = "";
    state.client.setApiKey("");
    $("api-key-input").value = "";
    showSetup();
    setStatus($("setup-status"), "Enter a replacement API key.", "loading");
  };
  $("change-key").addEventListener("click", beginKeyChange);
  $("header-change-key").addEventListener("click", beginKeyChange);
  $("team-form").addEventListener("submit", (event) => {
    event.preventDefault();
    loadTeam($("team-input").value, state.year);
  });
  $("year-select").addEventListener("change", () => {
    state.year = Number($("year-select").value);
    loadTeam(state.team, state.year);
  });
  $("stats-tab").addEventListener("click", () => switchTab("stats"));
  $("matches-tab").addEventListener("click", () => switchTab("matches"));
  $("event-select").addEventListener("change", () => {
    const eventKey = $("event-select").value;
    if (eventKey) loadMatches(eventKey);
  });
  $("event-key-form").addEventListener("submit", (event) => {
    event.preventDefault();
    loadMatches($("event-key-input").value);
  });
}

async function init() {
  state.client = new Match13Client({ fetchImpl: fetchViaBackground });
  renderYearOptions();
  wireEvents();
  showSetup();
  state.apiKey = await loadStoredKey();
  state.client.setApiKey(state.apiKey);
  showSetup();
}

init();
