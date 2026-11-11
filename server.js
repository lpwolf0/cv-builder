/* Tiny dependency-light server: serves /public and exposes POST /api/pdf.
   The CV data is posted, rendered by the SAME template code in headless Chromium, and returned as a PDF.
   Nothing is written to disk or a database: the data lives only in memory for the length of the request. */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY = 25 * 1024 * 1024;
const MAX_CONCURRENT = 3;
const CHROME = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };

let browserP;
function getBrowser() {
  if (!browserP) {
    browserP = chromium.launch({ headless: true, ...(CHROME ? { executablePath: CHROME } : {}), args: ['--no-sandbox', '--font-render-hinting=none'] })
      .then((b) => { b.on('disconnected', () => { browserP = null; }); return b; })
      .catch((e) => { browserP = null; throw e; });
  }
  return browserP;
}

let active = 0;
const waiting = [];
const acquire = () => new Promise((res) => { if (active < MAX_CONCURRENT) { active++; res(); } else waiting.push(res); });
const release = () => { const n = waiting.shift(); if (n) n(); else active--; };

export async function makePdf(cv, origin) {
  const browser = await getBrowser();
  const ctx = await browser.newContext({ viewport: { width: 794, height: 1123 }, javaScriptEnabled: true, serviceWorkers: 'block' });
  try {
    const page = await ctx.newPage();
    // Only our own origin may be loaded: no outbound requests from user-supplied content.
    await page.route('**/*', (route) => {
      const u = route.request().url();
      return u.startsWith(origin) || u.startsWith('data:') || u.startsWith('blob:') ? route.continue() : route.abort();
    });
    await page.goto(`${origin}/render.html`, { waitUntil: 'load', timeout: 20000 });
    await page.waitForFunction('window.__cvLoaded === true', null, { timeout: 15000 });
    const info = await page.evaluate((data) => window.renderCV(data), cv);
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    return { pdf, pages: info.pages };
  } finally {
    await ctx.close().catch(() => {});
  }
}

function send(res, code, body, headers = {}) { res.writeHead(code, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }); res.end(body); }

async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX_BODY) throw Object.assign(new Error('Payload too large'), { status: 413 }); chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (req.method === 'POST' && url.pathname === '/api/pdf') {
        let cv;
        try { cv = JSON.parse(await readBody(req)); } catch (e) { return send(res, e.status || 400, JSON.stringify({ error: e.status === 413 ? 'Your CV (photo) is too large to export.' : 'Invalid request.' }), { 'Content-Type': 'application/json' }); }
        await acquire();
        try {
          const { pdf, pages } = await makePdf(cv, origin);
          const nm = [cv?.person?.firstName, cv?.person?.otherNames].filter(Boolean).join(' ').trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_') || 'My';
          return send(res, 200, pdf, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nm}_CV.pdf"`, 'X-CV-Pages': String(pages) });
        } finally { release(); }
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      let p = decodeURIComponent(url.pathname);
      if (p === '/') p = '/index.html';
      const file = path.normalize(path.join(ROOT, p));
      if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden');
      try {
        const data = await readFile(file);
        return send(res, 200, req.method === 'HEAD' ? '' : data, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      } catch { return send(res, 404, 'Not found'); }
    } catch (err) {
      console.error('Request failed:', err);
      send(res, 500, JSON.stringify({ error: 'Could not generate the PDF. Please try again.' }), { 'Content-Type': 'application/json' });
    }
  });
}

let server;
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server = createServer();
  server.listen(PORT, () => console.log(`CV Builder running at http://localhost:${PORT}`));
  const bye = async () => { try { (await browserP)?.close(); } catch {} process.exit(0); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye);
}
export const attach = (s) => { server = s; };
