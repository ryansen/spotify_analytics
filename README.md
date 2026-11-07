# Listening Room — Spotify Analysis

This is the local source for ryansen/spotify_analytics. The deployment workflow at .github/workflows/pages.yml publishes dist after pushes to main. In repository Settings → Pages, select GitHub Actions as the source.

Register this exact Spotify redirect URI, including its trailing slash:

https://ryansen.github.io/spotify_analytics/

The public Client ID is configured in dist/config.js. No Client Secret is required. Tokens stay in tab memory. Genre enrichment and recommendations are future milestones. The pre-login dashboard is explicitly illustrative.

Run locally with `node server.mjs`; test with `node --test tests/*.test.mjs`.

## GitHub Pages HTML entry

The repository root now contains the complete dashboard in index.html. For the current branch-based publication, use Settings → Pages → main / (root). The same app can also be published by the included GitHub Actions workflow using the dist artifact.

Edit dist/index.html and its CSS/JavaScript assets, then run `npm run build` to regenerate the root HTML entry. Run `npm test` before publishing. Neither route needs a server or Client Secret. Spotify authorization still needs the registered callback and an approved beta account.
