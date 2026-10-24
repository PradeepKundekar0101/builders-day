// Local dev server: serves public/ and the /api functions without the Vercel CLI.
//   cp .env.example .env && npm install && npm run dev   ->  http://localhost:3000
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const PORT = process.env.PORT || 3000;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z-]/g, '');
    const file = path.resolve('api', `${name}.js`);
    if (!existsSync(file)) { res.statusCode = 404; return res.end('{"error":"Not found"}'); }
    const mod = await import(file);
    return mod.default(req, res);
  }
  let p = path.join('public', path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
  if (p.endsWith(path.sep) || p === 'public') p = path.join(p, 'index.html');
  try {
    const data = await readFile(p);
    res.setHeader('Content-Type', TYPES[path.extname(p)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404; res.end('Not found');
  }
}).listen(PORT, () => console.log(`Provn Route on http://localhost:${PORT}`));
