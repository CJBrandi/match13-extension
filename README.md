# match13-extension

A compact Firefox extension for Match 13 team statistics and match forecasts.

## Features

- Team Stats view with an always-available team search bar and season selector.
- xP, rank, percentile, EPA, OPR, DPR, game-phase estimates, variance, and ranking-point probabilities.
- Event history for the selected team and year.
- Matches view with an event selector, manual event-key fallback, predicted red/blue scores, red win probability, and expandable team rating changes.
- Popup state is intentionally ephemeral: closing the popup clears the selected team.

The extension uses only the documented Match 13 API data. The match endpoint does not provide alliance membership or actual final scores, so the match table does not invent those columns.

## Install temporarily in Firefox

1. Create or rotate a Match 13 API key. Do not use a key that has been committed to source control or pasted into a public repository.
2. Open `about:debugging` in Firefox.
3. Select **This Firefox**, then **Load Temporary Add-on…**.
4. Select this repository’s `manifest.json`.
5. Open the extension from the toolbar, paste your API key, and click **Connect**. Approve Firefox access to `actions.match13.com` if prompted.
6. If a saved key already exists, use **Allow API access** when shown, then load your team.

Temporary extensions are removed when Firefox restarts. A normal installable Firefox add-on also needs Mozilla signing through addons.mozilla.org.

## Development

```sh
npm install
npm test
npm run lint
npm run build
```

`npm run build` creates a Firefox package in `dist/` using `web-ext`. The package contains no API key; the key is entered at runtime and stored with Firefox’s extension storage.

## API and permissions

The extension calls these Match 13 read routes:

- `GET /v1/teams/{team}/years/{year}?scope=season`
- `GET /v1/teams/{team}/years/{year}/events?scope=season`
- `GET /v1/events/{eventKey}/matches`

The only host permission is `https://actions.match13.com/*`, needed because the API does not send browser CORS headers. The only API permission is `storage`, used to keep the user-provided key locally. No options page, content scripts, or broad website permissions are requested.

## Security note

An API key used by a client-side extension can be extracted by someone who controls the browser profile or inspects the extension at runtime. Use a key intended for this personal tool and revoke it if it is exposed. Never add keys to `README.md`, JavaScript, test fixtures, build artifacts, GitHub Actions, or commit history.

## Connection troubleshooting

The documented API origin is `https://actions.match13.com`; the website's internal `api.match13.com` origin is not a replacement. Live verification on September 17, 2026 returned HTTP 200 for authenticated team stats and event history. The API does not provide browser CORS headers and returns 405 to an OPTIONS preflight. A normal webpage, or a Firefox extension without the granted host permission, cannot fetch it.

- Click **Connection → Allow API access** and approve the API host. The extension checks permission before every request.
- For a rejected key (401), enter a replacement under **Connection**. Keys are saved only after access is granted.
- A 404 means that particular team, season, or event is missing; try a listed event. The documentation's example `2026casj` currently returns 404.
- If access is granted but requests still fail, check your network, VPN, firewall, and whether the API is reachable. Requests time out after 15 seconds.
- Reload the updated extension in `about:debugging`. Opening `popup.html` as a regular webpage cannot connect.

## Official artwork

Assets were retrieved directly from https://www.match13.com/ on September 17, 2026:

- `assets/wordmark.svg`: the site's inline SVG wordmark, with the site's white ink color resolved and its viewBox expanded slightly to avoid clipping the mountain peak. Original vector geometry is preserved.
- `assets/clouds.webp`: https://www.match13.com/assets/clouds_pano-B7pZUEnu.webp (unchanged).
- `assets/icon.png`: https://www.match13.com/icon-192.png (unchanged).

Match13 artwork belongs to its respective owner. This is an unofficial extension.
