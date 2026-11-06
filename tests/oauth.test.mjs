import test from 'node:test';
import assert from 'node:assert/strict';
import { challengeFor, validateCallback, createSpotifyClient, tokenRequest } from '../dist/oauth.js';
import { redirectUri } from '../dist/config.js';

const pending = { state:'expected', verifier:'verifier', uri:'http://127.0.0.1:3000/api/auth/callback/spotify', created:1000 };
const token = { access_token:'test-only-access', refresh_token:'test-only-refresh', expires_in:3600 };
test('PKCE matches the RFC 7636 reference vector', async () => {
  assert.equal(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});
test('registered local redirect and HTTPS production root are stable', () => {
  assert.equal(redirectUri({hostname:'127.0.0.1',origin:'http://127.0.0.1:3000'}),pending.uri);
  assert.equal(redirectUri({hostname:'example.com',origin:'https://example.com'}),'https://example.com/');
  assert.equal(redirectUri({hostname:'ryansen.github.io',origin:'https://ryansen.github.io'}),'https://ryansen.github.io/spotify_analytics/');
});
test('callback accepts a matching state and rejects missing, mismatched, expired, and future attempts', () => {
  const valid = new URLSearchParams('code=abc&state=expected');
  assert.equal(validateCallback(valid,pending,2000),'abc');
  for (const [params,attempt,now] of [
    [new URLSearchParams('code=abc'),pending,2000],
    [new URLSearchParams('code=abc&state=wrong'),pending,2000],
    [valid,null,2000], [valid,pending,602000], [valid,pending,500],
    [new URLSearchParams('state=expected'),pending,2000]
  ]) assert.throws(() => validateCallback(params,attempt,now));
});
test('denied consent is handled without accepting a code', () => {
  assert.throws(() => validateCallback(new URLSearchParams('error=access_denied&state=expected'),pending,2000),/cancelled/);
});
test('token endpoint errors never expose provider response text', async () => {
  await assert.rejects(tokenRequest({},async()=>new Response('sensitive-provider-detail',{status:400})), /Please reconnect/);
});
test('expired tokens refresh once for concurrent requests and preserve an unrotated refresh token', async () => {
  let time=0; let refreshes=0; const bodies=[];
  const fetcher=async(url,options)=>{
    if(url.includes('/api/token')) { refreshes++; bodies.push(String(options.body)); return Response.json({access_token:`next-${refreshes}`,expires_in:60}); }
    assert.match(options.headers.Authorization,/Bearer next-/); return Response.json({items:[]});
  };
  const api=createSpotifyClient({...token,expires_in:1},fetcher,()=>time);
  await Promise.all([api.get('/me/top/tracks'),api.get('/me/top/artists')]);
  assert.equal(refreshes,1);
  time=61000; await api.get('/me/player/recently-played');
  assert.equal(refreshes,2); assert.ok(bodies.every(body=>body.includes('refresh_token=test-only-refresh')));
});
test('401 retries once after refresh; 403 and rate limits return useful errors',async()=>{
  let calls=0;
  const api=createSpotifyClient(token,async url=>{
    if(url.includes('/api/token')) return Response.json({...token,access_token:'next'});
    calls++; return calls===1?new Response('',{status:401}):Response.json({id:'owner'});
  },()=>0);
  assert.deepEqual(await api.get('/me'),{id:'owner'}); assert.equal(calls,2);
  const denied=createSpotifyClient(token,async()=>new Response('',{status:403}),()=>0);
  await assert.rejects(denied.get('/me'),/Users and Access/);
  const limited=createSpotifyClient(token,async()=>new Response('',{status:429,headers:{'Retry-After':'45'}}),()=>0);
  await assert.rejects(limited.get('/me'),/45 seconds/);
});
test('disconnect blocks cached data and in-flight results',async()=>{
  let finish;
  const api=createSpotifyClient(token,()=>new Promise(resolve=>{finish=resolve}),()=>0);
  const request=api.get('/me'); api.close(); finish(Response.json({id:'private'}));
  await assert.rejects(request,/Disconnected/); await assert.rejects(api.get('/me'),/Disconnected/);
});
