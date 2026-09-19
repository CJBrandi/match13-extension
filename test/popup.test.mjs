import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const flush = () => new Promise(resolve => setTimeout(resolve, 15));

test("popup connects, recovers permissions, renders stats and matches, and replaces keys", async () => {
  const dom = new JSDOM(await readFile(new URL('../popup.html', import.meta.url), 'utf8'), { url: 'https://extension.test/' });
  globalThis.document = dom.window.document;
  let allowed = false;
  let grant = false;
  const stored = {};
  globalThis.browser = {
    permissions: { contains: async () => allowed, request: async () => { allowed = grant; return allowed; } },
    storage: { local: { get: async () => stored, set: async value => Object.assign(stored, value) } },
  };
  let failTeam = false;
  globalThis.fetch = async url => {
    if (failTeam) return new Response(JSON.stringify({ detail: 'Invalid key' }), { status: 401 });
    const data = url.includes('/matches') ? { matches: [{ key: '2026test_qm1', pred: {redScore: 100, blueScore: 90, winProb: .7}, teams: {'581': {xpPre: null, xpPost: 12}} }] }
      : url.includes('/events') ? {events: [{eventKey: '2026test', xpStart: 80, xpEnd: 100}]}
      : {xp: 100, rank: 4, percentile: 99, epa: null, xAuto: 30, xTele: 60, xEnd: 10};
    return new Response(JSON.stringify(data));
  };
  await import('../popup.js');
  await flush();
  const $ = id => document.getElementById(id);
  const submit = async id => { $(id).dispatchEvent(new dom.window.Event('submit', {cancelable: true})); await flush(); };
  assert.equal($('permission-button').hidden, false);
  $('api-key-input').value = 'm13_test';
  await submit('key-form');
  assert.match($('setup-status').textContent, /not granted/);
  assert.equal(stored.match13ApiKey, undefined);
  grant = true;
  await submit('key-form');
  assert.equal(stored.match13ApiKey, 'm13_test');
  assert.equal($('team-setup').hidden, false);
  $('setup-team').value = '581';
  await submit('setup-form');
  assert.equal($('dashboard-view').hidden, false);
  assert.match($('stats-content').textContent, /100.0/);
  assert.match($('stats-content').textContent, /EPA—/);
  $('matches-tab').click();
  assert.equal($('matches-panel').hidden, false);
  $('event-select').value = '2026test';
  $('event-select').dispatchEvent(new dom.window.Event('change'));
  await flush();
  assert.match($('matches-content').textContent, /Qual 1/);
  assert.match($('matches-content').textContent, /70%/);
  $('event-select').value = '';
  $('event-select').dispatchEvent(new dom.window.Event('change'));
  assert.match($('matches-content').textContent, /Choose an event/);
  $('stats-tab').click();
  failTeam = true;
  $('team-input').value = '254';
  await submit('team-form');
  assert.match($('stats-status').textContent, /key was rejected/);
  $('connection-button').click();
  await flush();
  assert.equal($('key-setup').hidden, false);
  $('api-key-input').value = 'm13_replacement';
  await submit('key-form');
  assert.equal(stored.match13ApiKey, 'm13_replacement');
  assert.equal($('back-button').hidden, true);
  delete globalThis.browser;
  delete globalThis.document;
  dom.window.close();
});
