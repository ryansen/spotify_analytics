import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, excluded, genreTags, similarity, layout, trackKey, songsFrom, heatmap, localDay, genreColor } from '../dist/exploration-data.js';
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
test('classification recognizes explicit noise and ASMR labels without treating ordinary titles as noise',()=>{
  for(const title of ['ASMR Whispering','Pink Noise for Sleep','White noise','Brown Noise','Rain sounds','Binaural beats']) assert.ok(classify({name:title}));
  for(const title of ['Pink + White','Dreams','The Sound of Silence','Noises','Asmar']) assert.equal(classify({name:title}),null);
  assert.match(classify({name:'Track 1',album:{name:'ASMR Sessions'}}),/album/);
});
test('classification overrides and toggle are reversible without mutating source tracks',()=>{
  const track=Object.freeze({id:'noise',name:'Pink Noise'}),overrides=new Map();
  assert.equal(excluded(track,false,overrides),false);assert.equal(excluded(track,true,overrides),true);
  overrides.set(trackKey(track),'include');assert.equal(excluded(track,true,overrides),false);
  overrides.set(trackKey(a),'exclude');assert.equal(excluded(a,true,overrides),true);assert.equal(excluded(a,false,overrides),false);
});
test('song union deduplicates tracks while heatmap retains separate listening events',()=>{
  assert.equal(songsFrom({tracks:[a],recent:{items:[{track:a},{track:b},{track:null}]}}).length,2);
});
const play=(track,day,hour)=>({track,played_at:new Date(2026,10,day,hour,0).toISOString()});
test('each multi-genre play counts once; zero observed cells differ from unknown coverage',()=>{
  const raw=[play(a,2,9),play(a,2,10),play(c,3,9),{track:b,played_at:null},{track:b,played_at:'bad'}];
  const m=heatmap(raw,artists,{start:'2026-11-01',end:'2026-11-04'});
  assert.equal([...m.cells.values()].reduce((sum,x)=>sum+x.length,0),3);
  assert.equal(m.cells.get(JSON.stringify(['art pop','2026-11-02'])).length,2);
  assert.equal(m.cells.has(JSON.stringify(['rock','2026-11-02'])),false);
  assert.equal(m.observed.has('2026-11-02'),true);assert.equal(m.observed.has('2026-11-01'),false);
  assert.equal(m.totals.get('2026-11-02'),2);
});
test('heatmap date and hour filters use local dates; exclusion preserves coverage and unknown genres',()=>{
  const noise={id:'n',name:'Pink noise'},raw=[play(a,2,9),play(noise,3,11)];
  const options={start:localDay(raw[0].played_at),end:'2026-11-03',mode:'hours',hideNoise:true};
  const m=heatmap(raw,artists,options);
  assert.equal(m.columns.length,24);assert.equal(m.included.length,1);assert.equal(m.observed.has('11'),true);
  assert.equal(m.totals.has('11'),false);
  const unknown=heatmap(raw,[],{start:'2026-11-03',end:'2026-11-03'});assert.deepEqual(unknown.rows,['Unknown']);
  assert.equal(unknown.included.length,1);
  const empty=heatmap(raw,artists,{start:'2026-11-04',end:'2026-11-03'});assert.equal(empty.columns.length,0);assert.equal(empty.included.length,0);
});
