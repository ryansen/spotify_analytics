import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from '../dist/session.js';
import { createSpotifyClient } from '../dist/oauth.js';
function storage() { const map = new Map(); return {getItem:k=>map.get(k) ?? null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}; }
test('reload restores tokens with the original absolute expiry, then refresh rotates the saved session', async () => {
  const disk=storage(); let time=1000;
  const saved=createSessionStore(disk,()=>time);
  const original=createSpotifyClient({access_token:'old',refresh_token:'refresh',expires_in:60},fetch,()=>time,saved);
  original.close({forget:false}); time=62000;
  const restored=createSessionStore(disk,()=>time);
  assert.equal(restored.load().expires_at,61000);
  let refreshed=0;
  const api=createSpotifyClient(restored.load(),async (url,options)=>{
    if(url.includes('/api/token')) {refreshed++; return Response.json({access_token:'new',refresh_token:'rotated',expires_in:3600});}
    assert.equal(options.headers.Authorization,'Bearer new'); return Response.json({id:'test'});
  },()=>time,restored);
  await api.get('/me'); assert.equal(refreshed,1);
  assert.equal(restored.load().refresh_token,'rotated');
  assert.equal(restored.load().expires_at,3662000);
  api.close(); assert.equal(restored.load(),null);
});
test('corrupt or expired non-refreshable sessions are discarded',()=>{
  const disk=storage(); const saved=createSessionStore(disk,()=>2000);
  saved.save({access_token:'expired',expires_at:1000}); assert.equal(saved.load(),null);
  saved.save({access_token:'bad',expires_at:'not-a-time',refresh_token:'refresh'}); assert.equal(saved.load(),null);
});
test('disconnect during refresh cannot recreate saved credentials',async()=>{
  const saved=createSessionStore(storage(),()=>1000); let finish;
  const api=createSpotifyClient({access_token:'old',refresh_token:'refresh',expires_at:0},()=>new Promise(resolve=>{finish=resolve}),()=>1000,saved);
  const request=api.get('/me'); api.close();
  finish(Response.json({access_token:'new',expires_in:3600}));
  await assert.rejects(request,/Disconnected/); assert.equal(saved.load(),null);
});
