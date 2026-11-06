import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
export const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow:'GET, HEAD' }); return res.end(); }
  try {
    if (req.headers.host !== '127.0.0.1:3000') { res.writeHead(400); return res.end('Open http://127.0.0.1:3000'); }
    const path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1:3000').pathname);
    const relative = path === '/' || path === '/api/auth/callback/spotify' ? 'index.html' : path.slice(1);
    const file = resolve(root, relative);
    if (!file.startsWith(resolve(root) + sep)) { res.writeHead(403); return res.end(); }
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'X-Frame-Options':'DENY' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(3000, '127.0.0.1', () => process.stdout.write('Listening Room: http://127.0.0.1:3000\n'));
