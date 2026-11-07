# Listening Room — Spotify Analysis

This is the local source for ryansen/spotify_analytics. The deployment workflow at .github/workflows/pages.yml publishes dist after pushes to main. In repository Settings → Pages, select GitHub Actions as the source.

Register this exact Spotify redirect URI, including its trailing slash:

https://ryansen.github.io/spotify_analytics/

The public Client ID is configured in dist/config.js. No Client Secret is required. Tokens stay in tab session storage so refreshes preserve the connection; Disconnect clears them. The constellation uses artist genre tags only when Spotify returns them; missing genres stay Unknown. Recommendations remain a future milestone. The pre-login dashboard is explicitly illustrative.

Run locally with `node server.mjs`; test with `node --test tests/*.test.mjs`.

## GitHub Pages HTML entry

The repository root now contains the complete dashboard in index.html. For the current branch-based publication, use Settings → Pages → main / (root). The same app can also be published by the included GitHub Actions workflow using the dist artifact.

Edit dist/index.html and its CSS/JavaScript assets, then run `npm run build` to regenerate the root HTML entry. Run `npm test` before publishing. Neither route needs a server or Client Secret. Spotify authorization still needs the registered callback and an approved beta account.

## Song constellation

The overview and Explore view show a stable graph of returned top tracks and recent songs. Connections use shared artists (70%) and artist-derived genre overlap (up to 30%), not audio analysis. Search and genre filters hide nodes without rearranging the layout.

Scroll over the map or pinch to zoom at the pointer; drag to pan. Outside the map, page scrolling works normally. With the map focused, arrow keys pan, + / - zoom, and 0 or Home resets. Tab to songs and press Enter or Space, or use the song-list alternative. Selected relationships stay highlighted while hovering other songs.

Likely ASMR and sound recordings are automatically excluded from derived song views using explicit metadata and specific sound-recording genre tags. Ambiguous phrases such as “White Noise” without supporting context stay included. No audio is analyzed, source responses remain unchanged, and artist rankings remain Spotify’s rankings. Preview data and genres are illustrative fixtures.
