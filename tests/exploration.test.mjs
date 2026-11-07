import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, musicData, genreTags, similarity, layout, songsFrom, genreColor } from '../dist/exploration-data.js';
const artists = [{ id:'a', name:'A', genres:['rock','art pop','rock'] },{id:'b',name:'B',genres:['rock']}];
const a={id:'1',name:'One',artists:[{id:'a',name:'A'}]}, b={id:'2',name:'Two',artists:[{id:'a',name:'A'}]}, c={id:'3',name:'Three',artists:[{id:'b',name:'B'}]};
test('genre enrichment joins artist IDs, deduplicates tags, and preserves unknowns',()=>{
  assert.deepEqual(genreTags(a,artists),['art pop','rock']);
  assert.deepEqual(genreTags({artists:[{id:'missing',name:'A'}]},artists),[]);
  assert.deepEqual(genreTags(a,[]),[]);
  assert.equal(genreColor('rock'),genreColor('rock'));
});
test('similarity is symmetric, explains positive relationships, and never relates unknowns',()=>{
  assert.equal(similarity(a,b,artists).score,1);
  assert.equal(similarity(a,c,artists).score,.15);
  assert.deepEqual(similarity(a,c,artists),similarity(c,a,artists));
  assert.equal(similarity({artists:[]},{artists:[]},[]).score,0);
  assert.deepEqual(similarity(a,c,artists).reasons,['Overlapping artist-derived tags: rock']);
});
test('layout is stable under input reordering and keeps every node within bounds',()=>{
  const first=layout([a,b,c],artists),second=layout([c,a,b],artists);
  assert.deepEqual(first,second);
  assert.ok(first.every(p=>p.x>=45 && p.x<=755 && p.y>=35 && p.y<=425));
  assert.deepEqual(layout([],artists),[]);
});
test('high-confidence ASMR and noise phrases handle punctuation and spacing',()=>{
  for(const name of ['ASMR Whispering','A.S.M.R. — Ear Cleaning','ASMR - no-talking tapping','Pink-Noise for Deep Sleep',' WHITE   NOISE : 8 HOURS ','Brown noise (seamless loop)','Rain sounds for sleeping','Ocean Sounds — 60 minutes','Binaural beats for focus']) assert.ok(classify({name}), name);
});
test('ambiguous song names, musical versions, and broad genre words stay included',()=>{
  for(const name of ['Pink + White','White Noise','Brown Noise','ASMR','Rain Sounds','Binaural Beats','Rain','Sleep','Ambient','Noise','The Sound of Silence','Noises','Asmar','Pink Noise Remix','ASMR (Song)','Ocean Sounds - Acoustic Version']) assert.equal(classify({name}),null,name);
  assert.equal(classify({name:'Dreams',artists:[{name:'Sleep'}],album:{name:'Ambient Rain'}}),null);
  assert.equal(classify({...a,name:'Dreams'},[{...artists[0],genres:['ambient','noise rock','sleep','meditation']}]),null);
});
test('specific genres and independent album or artist evidence support exclusion',()=>{
  assert.ok(classify({name:'Track 1',album:{name:'ASMR Sessions'}}));
  assert.ok(classify({name:'Rain Sounds',album:{name:'Sleep Sounds'}}));
  assert.ok(classify({name:'White Noise',artists:[{name:'Sleep Sounds Studio'}]}));
  assert.ok(classify({name:'Track 1',album:{name:'Brown Noise for Babies'}}));
  assert.ok(classify({...a,name:'Untitled'},[{...artists[0],genres:['sound effects']}]));
  assert.ok(classify({name:'Whispers',artists:[{name:'X',genres:['asmr']}]}));
  // Never combine fragments across separate metadata fields into a phrase.
  assert.equal(classify({name:'White',album:{name:'Noise'},artists:[{name:'Rain'}]}),null);
  assert.equal(classify({...a,name:'ASMR Song'},[{...artists[0],genres:['asmr']}]),null);
});
test('one automatic derived dataset consistently filters song views without changing raw responses or artist rankings',()=>{
  const noise={id:'noise',name:'Pink Noise for Sleep'}, fromGenre={id:'genre',name:'Track 1',artists:[{id:'noise-artist'}]};
  const artistList=[...artists,{id:'noise-artist',name:'Sound Studio',genres:['white noise']}];
  const data={tracks:[noise,a,fromGenre,b],artists:artistList,recent:{items:[{track:noise},{track:c},{track:fromGenre},{track:null}],cursors:{after:'123'}}};
  const before=JSON.stringify(data), music=musicData(data);
  assert.deepEqual(music.tracks,[a,b]);
  assert.deepEqual(music.recent.items,[{track:c}]);
  assert.deepEqual(songsFrom(music),[a,b,c]);
  assert.equal(music.tracks[0],a); // Highlights and lists share this filtered ranking.
  assert.equal(music.recent.items[0].track,c);
  assert.equal(music.artists,artistList);
  assert.equal(music.recent.cursors,data.recent.cursors);
  assert.equal(JSON.stringify(data),before);
  assert.deepEqual(musicData({}).tracks,[]);
});
test('song union deduplicates tracks and ignores missing recent tracks',()=>{
  assert.equal(songsFrom({tracks:[a],recent:{items:[{track:a},{track:b},{track:null}]}}).length,2);
});
