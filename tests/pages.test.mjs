import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
test('GitHub Pages root serves the dashboard with resolvable styles, scripts, and favicon', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /id="connect"/);
  assert.match(html, /id="track-list"/);
  for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) {
    await access(new URL(match[1], root));
  }
  const module = await readFile(new URL('dist/app.js', root), 'utf8');
  for (const match of module.matchAll(/from '(\.\/[^']+)'/g)) {
    await access(new URL(match[1], new URL('dist/', root)));
  }
  await access(new URL('.nojekyll', root));
  await access(new URL('dist/.nojekyll', root));
});
