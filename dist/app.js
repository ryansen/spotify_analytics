import { beginLogin, completeLogin, createSpotifyClient, clearPendingLogin } from './oauth.js';
import { createSessionStore } from './session.js';
import { redirectUri } from './config.js';
import { createExploration } from './exploration.js';
import { classify, songsFrom } from './exploration-data.js';

const session = createSessionStore(window.sessionStorage);
const $ = id => document.getElementById(id);
const ranges = { short_term: 'last 4 weeks', medium_term: 'last 6 months', long_term: 'approximately 1 year' };
const samples = [
  ['Pink + White', 'Frank Ocean', 'Blonde', 184516],
  ['Nude', 'Radiohead', 'In Rainbows', 255386],
  ['Space Song', 'Beach House', 'Depression Cherry', 320466],
  ['Everything In Its Right Place', 'Radiohead', 'Kid A', 251426],
  ['Dreams', 'Fleetwood Mac', 'Rumours', 257800]
];
const demo = {
  tracks: samples.map(([name, artist, album, duration_ms]) => ({ name, artists: [{ name: artist }], album: { name: album }, duration_ms, demo: true })),
  artists: ['Frank Ocean', 'Radiohead', 'Beach House', 'Fleetwood Mac'].map(name => ({ name, demo: true })),
  recent: { items: samples.slice(0, 4).map(([name, artist, album, duration_ms]) => ({ track: { name, artists: [{ name: artist }], album: { name: album }, duration_ms, demo: true }, played_at: null })) }
};
// These tags and timestamps are authored fixtures, never Spotify account data.
const demoGenres = { 'Frank Ocean': ['alternative r&b'], Radiohead: ['art rock', 'alternative rock'], 'Beach House': ['dream pop'], 'Fleetwood Mac': ['soft rock'] };
demo.artists.forEach(a => { a.genres = demoGenres[a.name]; });
demo.tracks.push({ name: 'Pink Noise for Sleep', artists: [{ name: 'Demo Sound Studio' }], album: { name: 'Illustrative soundscape' }, demo: true });
demo.recent.items = Array.from({length:30}, (_,i) => ({track:demo.tracks[i%demo.tracks.length], played_at:new Date(2026,10,2+i%5,8+(i*3)%15,i%60).toISOString()})).sort((a,b)=>b.played_at.localeCompare(a.played_at));
let client;
let connected = false;
let view = 'overview';
let range = 'short_term';
let data = { ...demo };
let errors = {};
let generation = 0;
let lastLoaded = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function spotifyUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'open.spotify.com' ? url.href : null; } catch { return null; }
}
function linkedName(item) {
  const url = spotifyUrl(item?.external_urls?.spotify);
  const node = el(url ? 'a' : 'strong', '', item?.name || 'Unknown track');
  if (url) { node.href = url; node.target = '_blank'; node.rel = 'noopener noreferrer'; }
  return node;
}
function cover(item, index, artist = false) {
  const url = (artist ? item.images : item.album?.images)?.[0]?.url;
  const allowed = ['i.scdn.co', 'mosaic.scdn.co', 'image-cdn-ak.spotifycdn.com', 'image-cdn-fa.spotifycdn.com'];
  let valid = false;
  try { const parsed = new URL(url); valid = parsed.protocol === 'https:' && allowed.includes(parsed.hostname); } catch {}
  if (valid) {
    const image = el('img', 'cover'); image.src = url; image.alt = ''; image.loading = 'lazy';
    image.addEventListener('error', () => image.replaceWith(el('span', `cover cover-art c${index % 5}`, '♫')), { once: true });
    const link = spotifyUrl(item.external_urls?.spotify);
    if (!link) return image;
    const wrapper = el('a', 'cover'); wrapper.href = link; wrapper.target = '_blank'; wrapper.rel = 'noopener noreferrer';
    wrapper.setAttribute('aria-label', `Open ${item.name} on Spotify`); wrapper.append(image); return wrapper;
  }
  return el('span', `cover cover-art c${index % 5}`, artist ? (item.name || '?')[0] : '♫');
}
function artistNames(item) { return item.artists?.map(x => x.name).join(', ') || 'Unknown artist'; }
const exploration = createExploration({ el, cover, linkedName, onFilter: () => render() });
function duration(ms) { if (!Number.isFinite(ms)) return ''; return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`; }
function highlight(label, title, detail, icon) {
  const card = el('article', 'highlight'); card.append(el('div', 'eyebrow', label), el('span', 'card-icon', icon), el('h3', '', title), el('p', '', detail)); return card;
}
function stamp(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date) : 'Sample';
}
function trackRow(item, index, timestamp) {
  const row = el('div', 'track-row');
  row.append(el('span', 'rank', String(index + 1).padStart(2, '0')), cover(item, index));
  const info = el('div', 'track-info'); info.append(linkedName(item), el('small', '', artistNames(item)));
  row.append(info, el('span', 'row-detail', timestamp !== undefined ? stamp(timestamp) : duration(item.duration_ms)));
  return row;
}
function artistRow(item, index) {
  const row = el('div', 'artist-row'); row.append(cover(item, index, true));
  const info = el('div', 'track-info'); info.append(linkedName(item), el('small', '', item.demo ? 'Illustrative ranking' : 'Spotify artist'));
  row.append(info, el('span', 'rank', String(index + 1).padStart(2, '0'))); return row;
}
function render() {
  $('mode-badge').textContent = connected ? 'CONNECTED TO SPOTIFY' : 'ILLUSTRATIVE PREVIEW';
  $('session-label').textContent = connected ? 'Connected · this tab only' : 'Preview mode';
  $('mode-description').textContent = connected ? 'Your collection. A little closer.' : 'Connect to make this room yours.';
  $('source-label').textContent = connected ? 'Data provided by Spotify' : 'Sample content · illustrative only';
  $('connect').classList.toggle('hidden', connected);
  $('disconnect').classList.toggle('hidden', !connected);
  $('refresh').classList.toggle('hidden', !connected);
  const titles = { overview: 'In your rotation', tracks: 'Your top tracks', artists: 'Your top artists', recent: 'Recently in your room', explore: 'Follow the connections' };
  $('view-title').textContent = titles[view];
  document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === view); b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false'); });
  document.querySelector('.ranges').classList.toggle('hidden', view === 'recent');
  const exploreOnly = view === 'explore';
  document.querySelector('.collection-grid').classList.toggle('hidden', exploreOnly);
  $('highlights').classList.toggle('hidden', exploreOnly);
  $('exploration').classList.toggle('hidden', !['overview','explore'].includes(view));
  const tracks = (data.tracks || []).filter(t => !exploration.excluded(t));
  const artists = data.artists || [];
  const recent = (data.recent?.items || []).filter(p => p.track && !exploration.excluded(p.track));
  const songs = songsFrom(data), flagged = songs.filter(t => classify(t)), removed = songs.filter(t => exploration.excluded(t));
  $('noise-summary').textContent = `${flagged.length} likely ASMR / noise tracks detected · ${removed.length} excluded. Title, artist & album labels only; review or override in Explore → song list. Artist rankings remain Spotify’s original rankings.`;
  const topTrack = tracks[0]; const topArtist = artists[0];
  $('highlights').replaceChildren(
    highlight('YOUR LEADING TRACK', topTrack?.name || 'No ranking yet', topTrack ? artistNames(topTrack) : 'Listen a little more, then check back.', '↗'),
    highlight('YOUR LEADING ARTIST', topArtist?.name || 'No ranking yet', connected ? `Spotify ranking · ${ranges[range]}` : 'A sample of what this room can show.', '◎'),
    highlight('MOST RECENTLY PLAYED', recent[0]?.track?.name || 'Nothing returned yet', recent[0] ? (connected ? stamp(recent[0].played_at) : 'Connect to see your latest listening.') : 'Recent listening will appear here.', '◷')
  );
  const showArtists = view === 'artists'; const showRecent = view === 'recent';
  $('list-title').textContent = showArtists ? 'The artists that stay' : showRecent ? 'Your recent soundtrack' : 'The songs that stick';
  $('side-title').textContent = showArtists ? 'Still in rotation' : 'Your leading artists';
  $('side-eyebrow').textContent = showArtists ? 'ON REPEAT' : 'FAMILIAR VOICES';
  const key = showArtists ? 'artists' : showRecent ? 'recent' : 'tracks';
  const query = $('search').value.toLocaleLowerCase();
  const items = showArtists ? artists : showRecent ? recent : tracks;
  const indexed = items.map((item, index) => ({ item, index })).filter(({item}) => {
    const entry = showRecent ? item.track : item;
    return `${entry?.name} ${entry?.artists?.map(x => x.name).join(' ') || ''}`.toLocaleLowerCase().includes(query);
  });
  const list = $('track-list'); list.replaceChildren();
  if (errors[key]) list.append(el('p', 'error-card', errors[key]));
  else if (!indexed.length) list.append(el('p', 'empty', query ? 'No matches in this list.' : 'Spotify has not returned any items for this section.'));
  else indexed.forEach(({item,index}) => list.append(showArtists ? artistRow(item,index) : trackRow(showRecent ? item.track : item,index,showRecent ? item.played_at : undefined)));
  const side = $('artist-list'); side.replaceChildren();
  const sideKey = showArtists ? 'tracks' : 'artists';
  if (errors[sideKey]) side.append(el('p', 'error-card', errors[sideKey]));
  else (showArtists ? tracks : artists).slice(0,4).forEach((item,index) => side.append(showArtists ? trackRow(item,index) : artistRow(item,index)));
  if (!side.childNodes.length) side.append(el('p', 'empty', 'Your collection will appear here.'));
  $('list-foot').textContent = connected ? (showRecent ? 'Returned recent records · times shown in your local timezone' : `Spotify affinity ranking · ${ranges[range]} · song lengths are not time listened`) : 'Illustrative rankings · connect to see yours';
  $('coverage-note').textContent = connected
    ? `Updated ${lastLoaded ? new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(lastLoaded) : 'just now'}. Spotify rankings reflect affinity, not exact play counts. Recent records are a limited snapshot of listening history.`
    : 'This is an illustrative preview. Connect Spotify to load your own rankings and recent listening.';
  exploration.update(data, connected);
}
function notice(message) { $('notice').textContent = message; $('notice').classList.toggle('hidden', !message); }
async function load() {
  if (!client) return;
  const current = ++generation;
  const api = client;
  const requestedRange = range;
  $('loading').classList.remove('hidden'); $('refresh').disabled = true;
  const paths = { profile: '/me', tracks: `/me/top/tracks?time_range=${requestedRange}&limit=20`, artists: `/me/top/artists?time_range=${requestedRange}&limit=20`, recent: '/me/player/recently-played?limit=20' };
  const results = await Promise.all(Object.entries(paths).map(async ([key,path]) => {
    try { return { key, value: await api.get(path) }; } catch (error) { return { key, error: error.message || 'Could not reach Spotify. Please try again.' }; }
  }));
  if (current !== generation) return;
  errors = {};
  for (const result of results) {
    if (result.error) { errors[result.key] = result.error; data[result.key] = result.key === 'recent' ? {items:[]} : []; }
    else if (result.key === 'profile') $('profile-name').textContent = result.value.display_name || 'Your room.';
    else data[result.key] = result.key === 'recent' ? result.value : result.value.items || [];
  }
  lastLoaded = new Date();
  if (errors.profile) notice(errors.profile); else notice('');
  $('loading').classList.add('hidden'); $('refresh').disabled = false; render();
}
$('connect').addEventListener('click', async () => {
  $('connect').disabled = true; notice('');
  try { await beginLogin(); } catch { notice('Could not begin login. Allow session storage for this site and try again.'); $('connect').disabled = false; }
});
$('disconnect').addEventListener('click', () => {
  generation++; client?.close(); client = null; connected = false; data = { ...demo }; errors = {}; lastLoaded = null; exploration.reset();
  session.clear(); clearPendingLogin(); $('profile-name').textContent = 'Welcome in.'; $('loading').classList.add('hidden'); $('refresh').disabled = false; $('search').value = '';
  notice('Disconnected. Your session and loaded data have been cleared from this tab.'); render();
});
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {view = button.dataset.view; $('search').value = ''; render();}));
document.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => {
  if (range === button.dataset.range) return;
  range = button.dataset.range;
  document.querySelectorAll('[data-range]').forEach(b => { const selected = b === button; b.classList.toggle('selected',selected); b.setAttribute('aria-pressed',String(selected)); });
  if (connected) { data.tracks = []; data.artists = []; render(); load(); } else render();
}));
$('search').addEventListener('input', render);
$('hide-noise').addEventListener('change', event => { exploration.setNoise(event.target.checked); render(); });
$('refresh').addEventListener('click', load);
$('privacy-button').addEventListener('click', () => $('privacy-dialog').showModal());
// Privacy remains reachable on narrow screens through the footer.
const mobilePrivacy = el('button','text-button','Privacy & connection'); mobilePrivacy.addEventListener('click', () => $('privacy-dialog').showModal()); document.querySelector('footer').append(mobilePrivacy);
$('close-dialog').addEventListener('click', () => $('privacy-dialog').close());
$('redirect-value').textContent = redirectUri(window.location);
$('copy-redirect').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(redirectUri(window.location)); $('copy-redirect').textContent = 'Copied'; } catch { $('copy-redirect').textContent = 'Select and copy the address above'; }
});
render();
try {
  const tokens = await completeLogin() || session.load();
  if (tokens) { client = createSpotifyClient(tokens, fetch, () => Date.now(), session); connected = true; data = {}; render(); await load(); }
} catch (error) { notice(error.message); }
window.addEventListener('pagehide', () => { generation++; client?.close({ forget: false }); client = null; connected = false; });
window.addEventListener('pageshow', async event => {
  if (!event.persisted) return;
  const tokens = session.load();
  if (tokens) { client = createSpotifyClient(tokens, fetch, () => Date.now(), session); connected = true; data = {}; render(); await load(); }
  else { data = { ...demo }; errors = {}; $('profile-name').textContent = 'Welcome in.'; render(); }
});
