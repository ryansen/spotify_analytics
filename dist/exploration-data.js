export const UNKNOWN = 'Unknown';
export function trackKey(track) {
  return track.id || track.uri || JSON.stringify([track.name, (track.artists || []).map(a => a.id || a.name), track.album?.name]);
}
const artistKey = a => a.id || a.name?.toLocaleLowerCase();
export function genreTags(track, artists) {
  const tags = (track.artists || []).flatMap(a => {
    const full = artists.find(x => artistKey(x) === artistKey(a));
    return full?.genres || a.genres || [];
  });
  return [...new Set(tags.filter(g => typeof g === 'string' && g.trim()).map(g => g.trim().toLocaleLowerCase()))].sort();
}
export function classify(track) {
  const title = track.name || '';
  const context = `${track.album?.name || ''} ${(track.artists || []).map(a => a.name).join(' ')}`;
  const patterns = [
    [/\basmr\b/i, 'ASMR label'],
    [/\b(?:pink|white|brown|brownian|green|blue|violet|grey|gray)\s+noise\b/i, 'Colored-noise label'],
    [/\b(?:sleep|sleeping|relaxation|ambient)\s+(?:sounds?|noise)\b/i, 'Sleep / ambient-sound label'],
    [/\b(?:rain|ocean|nature|fan)\s+sounds?\b/i, 'Environmental-sound label'],
    [/\bbinaural\s+beats?\b/i, 'Binaural-beat label']
  ];
  for (const [pattern, reason] of patterns) {
    if (pattern.test(title)) return `${reason} in title`;
    if (pattern.test(context)) return `${reason} in artist or album`;
  }
  return null;
}
export function excluded(track, enabled, overrides = new Map()) {
  if (!enabled) return false;
  const override = overrides.get(trackKey(track));
  return override ? override === 'exclude' : Boolean(classify(track));
}
export function songsFrom(data) {
  const songs = new Map();
  for (const track of [...(data.tracks || []), ...(data.recent?.items || []).map(p => p.track)]) {
    if (track && !songs.has(trackKey(track))) songs.set(trackKey(track), track);
  }
  return [...songs.values()];
}
export function similarity(a, b, artists) {
  const aa = new Set((a.artists || []).map(artistKey).filter(Boolean));
  const sharedArtist = (b.artists || []).some(x => aa.has(artistKey(x)));
  const ag = genreTags(a, artists), bg = genreTags(b, artists);
  const overlap = ag.filter(g => bg.includes(g));
  const union = new Set([...ag, ...bg]).size;
  return { score: (sharedArtist ? 0.7 : 0) + (union ? 0.3 * overlap.length / union : 0),
    reasons: [...(sharedArtist ? ['Shared artist'] : []), ...(overlap.length ? [`Overlapping artist-derived tags: ${overlap.join(', ')}`] : [])] };
}
export function layout(songs, artists) {
  const sorted = [...songs].sort((a,b) => trackKey(a).localeCompare(trackKey(b)));
  const points = sorted.map((track,i) => ({ track, x: 400 + Math.cos(i * 2.39996) * (60 + i * 3), y: 230 + Math.sin(i * 2.39996) * (60 + i * 2) }));
  const weights = points.map(a => points.map(b => similarity(a.track,b.track,artists).score));
  for (let step = 0; step < 180; step++) {
    const moves = points.map(p => ({ x: (400-p.x)*0.004, y: (230-p.y)*0.004 }));
    for (let i=0;i<points.length;i++) for (let j=i+1;j<points.length;j++) {
      const dx=points[j].x-points[i].x, dy=points[j].y-points[i].y;
      const distance=Math.max(1,Math.hypot(dx,dy));
      const force=Math.min(5,1800/(distance*distance)) - weights[i][j]*Math.max(0,distance-65)*0.018;
      moves[i].x-=dx/distance*force; moves[i].y-=dy/distance*force;
      moves[j].x+=dx/distance*force; moves[j].y+=dy/distance*force;
    }
    points.forEach((p,i) => {p.x=Math.max(45,Math.min(755,p.x+moves[i].x));p.y=Math.max(35,Math.min(425,p.y+moves[i].y));});
  }
  return points;
}
export function localDay(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function heatmap(raw, artists, { start, end, mode='days', hideNoise=false, overrides=new Map() }) {
  const valid = raw.filter(p => p.track && p.played_at && Number.isFinite(Date.parse(p.played_at)));
  const within = valid.filter(p => { const day=localDay(p.played_at); return day>=start && day<=end; });
  const columns = [];
  if (mode === 'hours') for (let i=0;i<24;i++) columns.push(String(i).padStart(2,'0'));
  else {
    const date = new Date(`${start}T12:00:00`), stop = new Date(`${end}T12:00:00`);
    // The control limits daily views to 62 columns; never silently truncate.
    if (Number.isFinite(+date) && Number.isFinite(+stop)) while (date<=stop && columns.length<63) {columns.push(localDay(date));date.setDate(date.getDate()+1);}
  }
  const bucket = p => mode==='hours' ? String(new Date(p.played_at).getHours()).padStart(2,'0') : localDay(p.played_at);
  const observed = new Set(within.map(bucket));
  const included = within.filter(p => !excluded(p.track,hideNoise,overrides));
  const rows = [...new Set(included.map(p => genreTags(p.track,artists)[0] || UNKNOWN))].sort();
  const cells = new Map(), totals = new Map();
  for (const p of included) {
    const col=bucket(p), genre=genreTags(p.track,artists)[0] || UNKNOWN;
    const key=JSON.stringify([genre,col]);
    if (!cells.has(key)) cells.set(key,[]);
    cells.get(key).push(p); totals.set(col,(totals.get(col)||0)+1);
  }
  return { columns, rows, cells, totals, observed, valid, included };
}
export function genreColor(genre) {
  if (genre===UNKNOWN) return 7;
  let hash=0; for (const char of genre) hash=(hash*31+char.charCodeAt(0))>>>0;
  return hash%7;
}
