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
export function classify(track, artists = []) {
  const normalize = value => (value || '').normalize('NFKC').toLocaleLowerCase()
    .replace(/\ba[.\s_-]+s[.\s_-]+m[.\s_-]+r\b/g, 'asmr')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const title = normalize(track.name);
  const context = [track.album?.name, ...(track.artists || []).map(a => a.name)].map(normalize);
  const tags = genreTags(track, artists).map(normalize);
  const colored = /\b(?:pink|white|brown|brownian|green|blue|violet|grey|gray) noise\b/;
  const environment = /\b(?:rain|rainfall|ocean|waves|nature|forest|thunderstorm|fireplace|fan|waterfall|water|birds?) (?:sounds?|recordings?|ambience)\b/;
  const utility = /\b(?:for (?:deep )?(?:sleep|sleeping|relaxation|concentration|study|studying|babies|baby|focus|meditation)|\d+ (?:hours?|minutes?|hz)|seamless|loop|no talking|sound machine|noise machine)\b/;
  const asmr = /\basmr\b/;
  const triggers = /\b(?:whispering|whispers?|tapping|tingles?|triggers?|roleplay|mouth sounds?|ear cleaning|no talking)\b/;
  const soundLabel = /\b(?:sleep|sleeping|relaxation|ambient) (?:sounds?|noise)\b/;
  const soundContext = context.some(t => colored.test(t) || environment.test(t) || soundLabel.test(t) || asmr.test(t));
  const soundGenre = tags.some(t => /^(?:asmr|(?:pink|white|brown|green|blue|grey|gray) noise|sleep sounds|nature sounds|environmental sounds|sound effects|field recording)$/.test(t));
  // Musical versions and isolated phrases can be ordinary songs. Keep them.
  if (/\b(?:remix|song|cover|soundtrack|acoustic version)\b/.test(title)) return null;
  if (asmr.test(title) && (triggers.test(title) || utility.test(title) || soundContext || soundGenre)) return 'ASMR label with recording context';
  if ((colored.test(title) || environment.test(title) || soundLabel.test(title) || /\bbinaural beats?\b/.test(title)) && (utility.test(title) || soundContext || soundGenre)) return 'Sound-recording label with supporting context';
  if (soundGenre) return 'Specific ASMR / sound-recording artist genre';
  if (context.some(t => asmr.test(t) && (triggers.test(t) || /\b(?:sessions?|recordings?|sounds?)\b/.test(t)))) return 'ASMR recording label in artist or album';
  if (context.some(t => (colored.test(t) || environment.test(t) || soundLabel.test(t)) && utility.test(t))) return 'Sound-recording label and purpose in artist or album';
  return null;
}
export function musicData(data) {
  const artists = data.artists || [];
  const keep = track => track && !classify(track, artists);
  return { ...data, tracks: (data.tracks || []).filter(keep),
    recent: { ...data.recent, items: (data.recent?.items || []).filter(p => keep(p.track)) } };
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
export function genreColor(genre) {
  if (genre===UNKNOWN) return 7;
  let hash=0; for (const char of genre) hash=(hash*31+char.charCodeAt(0))>>>0;
  return hash%7;
}
