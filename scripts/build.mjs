import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const html = await readFile(new URL('dist/index.html', root), 'utf8');
// Support both branch-based Pages (repository root) and Actions (dist artifact).
const entry = html.replaceAll('href="./icon.svg"', 'href="./dist/icon.svg"')
  .replaceAll('href="./style.css"', 'href="./dist/style.css"')
  .replaceAll('src="./app.js"', 'src="./dist/app.js"');
await writeFile(new URL('index.html', root), entry);
await writeFile(new URL('.nojekyll', root), '');
await writeFile(new URL('dist/.nojekyll', root), '');
console.log('Built root HTML entry and static Pages markers.');
