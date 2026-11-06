# Listening Room — Spotify Analysis

This is the local source for ryansen/spotify_analytics. The deployment workflow at .github/workflows/pages.yml publishes dist after pushes to main. In repository Settings → Pages, select GitHub Actions as the source.

Register this exact Spotify redirect URI, including its trailing slash:

https://ryansen.github.io/spotify_analytics/

The public Client ID is configured in dist/config.js. No Client Secret is required. Tokens stay in tab memory. Genre enrichment and recommendations are future milestones. The pre-login dashboard is explicitly illustrative.

Run locally with `node server.mjs`; test with `node --test tests/*.test.mjs`.
