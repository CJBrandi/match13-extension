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
5. Open the extension from the toolbar and paste your API key when prompted.

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
