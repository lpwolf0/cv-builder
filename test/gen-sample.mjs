// Renders the sample CV via the real server endpoint and saves the PDF + PNG for comparison.
import fs from 'node:fs';
import { createServer, attach } from '../server.js';
const s = createServer(); attach(s);
await new Promise((r) => s.listen(0, '127.0.0.1', r));
const port = s.address().port;
const file = process.argv[2] || 'public/data/sample-cv.json';
const out = process.argv[3] || 'ref/out';
const cv = JSON.parse(fs.readFileSync(file, 'utf8'));
// inline the sample photo so the payload is the same shape the website sends
// photo src stays relative (assets/...) exactly as the browser app stores it
const res = await fetch(`http://127.0.0.1:${port}/api/pdf`, { method: 'POST', body: JSON.stringify(cv) });
console.log('status', res.status, res.headers.get('content-type'), 'pages', res.headers.get('x-cv-pages'));
if (res.status === 200) fs.writeFileSync(out + '.pdf', Buffer.from(await res.arrayBuffer())); else console.log(await res.text());
s.close(); process.exit(0);
