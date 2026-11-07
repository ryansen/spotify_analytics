import { CLIENT_ID, SCOPES, redirectUri } from './config.js';

const PENDING = 'listening-room:oauth';
export function randomString() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, '0')).join('');
}
export async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function beginLogin() {
  const verifier = randomString();
  const state = randomString();
  const uri = redirectUri(window.location);
  const challenge = await challengeFor(verifier);
  sessionStorage.setItem(PENDING, JSON.stringify({ verifier, state, uri, created: Date.now() }));
  const query = new URLSearchParams({ client_id: CLIENT_ID, response_type: 'code', redirect_uri: uri,
    scope: SCOPES, state, code_challenge_method: 'S256', code_challenge: challenge });
  window.location.assign(`https://accounts.spotify.com/authorize?${query}`);
}
export function validateCallback(params, pending, now = Date.now()) {
  if (!pending || !pending.state || !pending.verifier || !pending.uri || !Number.isFinite(pending.created) ||
      now - pending.created > 10 * 60 * 1000 || now < pending.created || params.get('state') !== pending.state) {
    throw new Error('This login has expired or could not be verified. Please connect again.');
  }
  if (params.has('error')) throw new Error(params.get('error') === 'access_denied'
    ? 'Spotify connection was cancelled. You can connect whenever you are ready.' : 'Spotify could not authorize the connection. Please try again.');
  const code = params.get('code');
  if (!code) throw new Error('Spotify did not return an authorization code. Please connect again.');
  return code;
}
export async function tokenRequest(body, fetcher = fetch) {
  let response;
  try {
    response = await fetcher('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, ...body }), signal: AbortSignal.timeout(15000)
    });
  } catch { throw new Error('Could not reach Spotify. Check your connection and try again.'); }
  if (!response.ok) throw new Error('Spotify could not complete this session. Please reconnect.');
  const result = await response.json();
  if (typeof result.access_token !== 'string' || !Number.isFinite(result.expires_in) || result.expires_in <= 0) {
    throw new Error('Spotify returned an incomplete session. Please reconnect.');
  }
  return result;
}
export async function completeLogin() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('code') && !params.has('error')) return null;
  // Remove one-time codes and provider error text before rendering or loading images.
  history.replaceState({}, '', redirectUri(window.location));
  let pending;
  try { pending = JSON.parse(sessionStorage.getItem(PENDING)); } catch { pending = null; }
  sessionStorage.removeItem(PENDING);
  const code = validateCallback(params, pending);
  if (pending.uri !== redirectUri(window.location)) throw new Error('The callback address changed. Please reconnect.');
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: pending.uri, code_verifier: pending.verifier });
}
export function clearPendingLogin() { sessionStorage.removeItem(PENDING); }

export function createSpotifyClient(initialToken, fetcher = fetch, now = () => Date.now(), session = null) {
  let token = initialToken;
  let expiresAt = token.expires_at ?? now() + token.expires_in * 1000;
  session?.save({ ...token, expires_at: expiresAt });
  let refreshPromise;
  let closed = false;
  const cache = new Map();
  async function refresh() {
    if (!token.refresh_token) throw new Error('Your session ended. Please reconnect to Spotify.');
    if (!refreshPromise) refreshPromise = tokenRequest({ grant_type: 'refresh_token', refresh_token: token.refresh_token }, fetcher)
      .then(next => { if (closed) throw new Error('Disconnected.'); token = { ...next, refresh_token: next.refresh_token || token.refresh_token }; expiresAt = now() + next.expires_in * 1000; session?.save({ ...token, expires_at: expiresAt }); })
      .finally(() => { refreshPromise = null; });
    await refreshPromise;
  }
  async function get(path, retry = true, bypassCache = false) {
    if (closed) throw new Error('Disconnected.');
    if (!path.startsWith('/me')) throw new Error('Unsupported Spotify request.');
    const cached = cache.get(path);
    if (!bypassCache && cached && now() - cached.at < 120000) return cached.data;
    if (now() >= expiresAt - 30000) await refresh();
    const response = await fetcher(`https://api.spotify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(15000)
    });
    if (closed) throw new Error('Disconnected.');
    if (response.status === 401 && retry) { await refresh(); return get(path, false, true); }
    if (response.status === 401) throw new Error('Your Spotify session is no longer valid. Please reconnect.');
    if (response.status === 403) throw new Error('Spotify denied access. Check that your account is in the app’s Users and Access list, then reconnect with the requested permissions.');
    if (response.status === 429) {
      const wait = Number(response.headers.get('Retry-After'));
      throw new Error(Number.isFinite(wait) && wait > 0 ? `Spotify is limiting requests. Try again in ${Math.ceil(wait)} seconds.` : 'Spotify’s request quota was reached. Please try later.');
    }
    if (!response.ok) throw new Error('Spotify could not load this section. Please try again.');
    const data = await response.json();
    if (closed) throw new Error('Disconnected.');
    cache.set(path, { data, at: now() });
    return data;
  }
  return { get, close({ forget = true } = {}) { closed = true; token = {}; cache.clear(); if (forget) session?.clear(); } };
}
