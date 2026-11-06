// Spotify Client IDs identify public OAuth clients; they are not client secrets.
export const CLIENT_ID = '07b1ada0402a412f94212b95447117d3';
export const SCOPES = 'user-top-read user-read-recently-played';
export function redirectUri(location) {
  return location.hostname === '127.0.0.1'
    ? `${location.origin}/api/auth/callback/spotify`
    : `${location.origin}${location.hostname === "ryansen.github.io" ? "/spotify_analytics/" : "/"}`;
}
