/* End-to-end QA: drives the real app in Chromium, generates real PDFs and inspects them.
   Run:  node test/qa.mjs [outDir]      (needs poppler-utils for pdfinfo/pdftotext/pdffonts/pdftoppm) */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer, attach } from '../server.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] || path.join(os.tmpdir(), 'cvqa');
mkdirSync(OUT, { recursive: true });
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);

const srv = createServer(); attach(srv);
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${srv.address().port}/`;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const sh = (cmd, ...a) => execFileSync(cmd, a, { encoding: 'utf8' });
const section = (t) => console.log(`\n== ${t}`);

const fixture = JSON.parse(readFileSync(path.join(HERE, 'fixtures/original-cv.json'), 'utf8'));
const photoBuf = Buffer.from(fixture.photo.src.split(',')[1], 'base64');
const photoPath = path.join(OUT, 'photo.jpg'); writeFileSync(photoPath, photoBuf);

const browser = await chromium.launch({ ...(CHROME ? { executablePath: CHROME } : {}), args: ['--no-sandbox'] });
const errors = [];
async function open(opts = {}, seed = null) {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  if (seed) await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, ['cvbuilder.cv.v1', JSON.stringify(seed)]);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE + '#build');
  await page.waitForSelector('#editor-root .ui-sec');
  return page;
}
const preview = (p) => p.locator('#cv');
const pageCount = (p) => p.locator('#cv .cv-page').count();
const settle = (p) => p.waitForTimeout(450);
const openSec = async (p, key) => { const d = p.locator(`.ui-sec[data-key="${key}"]`); if (!(await d.evaluate((e) => e.open))) await d.locator('summary').click(); return d; };
async function downloadPdf(p, name) {
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.locator('.ui-top [data-pdf]').click()]);
  const f = path.join(OUT, name); await dl.saveAs(f); return f;
}
const pdfInfo = (f) => ({ pages: Number(/Pages:\s+(\d+)/.exec(sh('pdfinfo', f))[1]), size: /Page size:\s+([\d.]+) x ([\d.]+)/.exec(sh('pdfinfo', f)).slice(1, 3).map(Number), text: sh('pdftotext', '-layout', f, '-'), fonts: sh('pdffonts', f) });

/* ---------------------------------------------------------------- */
section('1. Landing page');
{
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(BASE);
  ok(await p.locator('text=Start building my CV').first().isVisible(), 'landing shows Start building my CV');
  await p.waitForSelector('#hero-page.ready');
  ok((await p.locator('#hero-cv .cv-page').count()) === 1, 'landing renders the example CV with the real template');
  await p.click('[data-start]');
  await p.waitForSelector('#editor-root .ui-sec');
  ok(p.url().endsWith('#build') && (await p.locator('#app').isVisible()), 'Start button opens the editor');
  await p.close();
}

section('2. Editing every personal field updates the live preview');
const page = await open();
{
  ok(await page.locator('#empty-banner').isVisible(), 'empty-state banner shown for a new CV');
  const sec = await openSec(page, 'personal');
  const fill = async (label, v) => sec.getByLabel(label, { exact: true }).fill(v);
  await fill('First name (bold)', 'Ada');
  await fill('Other names', 'Lovelace King');
  await fill('Professional title', 'Mathematician and Analyst');
  await fill('Phone number', '+44 20 7946 0000');
  await fill('Email address', 'ada@example.org');
  await fill('Residential address', '12 Analytical Way, London');
  await settle(page);
  const t = await preview(page).innerText();
  for (const s of ['ADA', 'LOVELACE KING', 'MATHEMATICIAN AND ANALYST', '+44 20 7946 0000', 'ada@example.org', '12 Analytical Way, London']) ok(t.toUpperCase().includes(s.toUpperCase()), `preview shows "${s}"`);
  ok(!(await page.locator('#empty-banner').isVisible()), 'banner disappears once content exists');
  await sec.getByLabel('Heading on the CV').fill('Get in touch');
  await settle(page);
  ok((await preview(page).innerText()).toUpperCase().includes('GET IN TOUCH'), 'section heading is editable');
  await sec.getByLabel('Show this section').uncheck(); await settle(page);
  ok(!(await preview(page).innerText()).includes('ada@example.org'), 'hiding a section removes it from the CV');
  await sec.getByLabel('Show this section').check(); await settle(page);
  ok((await preview(page).innerText()).includes('ada@example.org'), 'showing it again restores it');
}

section('3. Photograph: upload, zoom, reposition, replace, remove, undo');
{
  const sec = await openSec(page, 'photo');
  const imgIn = () => preview(page).locator('.photo-img img');
  ok((await imgIn().count()) === 0, 'no photo in preview before upload (placeholder only)');
  await sec.locator('input[type=file]').setInputFiles(photoPath); await settle(page);
  ok((await imgIn().count()) === 1, 'uploaded photo appears in the CV circle');
  const st0 = await imgIn().getAttribute('style');
  await sec.locator('input[type=range]').fill('3'); await settle(page);
  const st1 = await imgIn().getAttribute('style');
  ok(st0 !== st1, 'zoom changes the photo size in the preview');
  const crop = sec.locator('.ui-crop'); const bb = await crop.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width / 2 + 40, bb.y + bb.height / 2 + 20, { steps: 5 }); await page.mouse.up(); await settle(page);
  ok((await imgIn().getAttribute('style')) !== st1, 'dragging repositions the photo');
  const cvJson = await page.evaluate(() => JSON.parse(localStorage.getItem('cvbuilder.cv.v1')));
  ok(cvJson.photo && cvJson.photo.zoom > 2.9 && cvJson.photo.cx >= 0 && cvJson.photo.cx <= 1, 'zoom/position persisted as numbers in range');
  await sec.getByRole('button', { name: 'Re-centre' }).click(); await settle(page);
  ok(Math.abs((await page.evaluate(() => JSON.parse(localStorage.getItem('cvbuilder.cv.v1')).photo.zoom)) - 1) < 0.01, 'Re-centre resets zoom');
  // big image gets downscaled
  const big = path.join(OUT, 'big.png');
  execFileSync('python3', ['-c', `from PIL import Image;Image.new('RGB',(4200,3000),(30,90,140)).save(${JSON.stringify(big)})`]);
  await sec.locator('input[type=file]').setInputFiles(big);
  await page.waitForFunction(() => { const x = JSON.parse(localStorage.getItem('cvbuilder.cv.v1') || '{}').photo; return x && x.src.length < 60000; }, null, { timeout: 15000 }).catch(() => {}); await settle(page);
  const dim = await page.evaluate(async () => { const s = JSON.parse(localStorage.getItem('cvbuilder.cv.v1')).photo.src; const i = new Image(); i.src = s; await i.decode(); return [i.naturalWidth, i.naturalHeight]; });
  ok(dim[0] === 1000 && dim[1] === 714, `4200x3000 upload is downscaled to ${dim.join('x')} (replace works)`);
  // invalid file
  await sec.locator('input[type=file]').setInputFiles({ name: 'x.png', mimeType: 'text/plain', buffer: Buffer.from('not an image') }); await settle(page);
  ok(/JPG, PNG or WebP/.test(await sec.locator('.ui-error').innerText()), 'invalid file shows an error message');
  await sec.locator('input[type=file]').setInputFiles(photoPath); await settle(page);
  await sec.getByRole('button', { name: 'Remove' }).click(); await settle(page);
  ok((await imgIn().count()) === 0, 'Remove clears the photo');
  await page.getByRole('button', { name: 'Undo' }).click(); await settle(page);
  ok((await imgIn().count()) === 1, 'Undo brings the photo back');
}

section('4. Summary, education add / edit / reorder / delete');
{
  const s = await openSec(page, 'profile');
  await s.getByLabel('Summary').fill('First paragraph here.\nSecond paragraph here.'); await settle(page);
  ok((await preview(page).locator('.profile-p').count()) === 2, 'multiline summary becomes two paragraphs');

  const e = await openSec(page, 'education');
  const add = e.getByRole('button', { name: 'Add education' });
  await add.click(); await add.click(); await add.click();
  const cards = e.locator('.ui-item');
  ok((await cards.count()) === 3, 'three education entries added');
  const vals = [['2010', 'ALPHA UNIVERSITY', 'BSc One\nHonours'], ['2006', 'BETA COLLEGE', 'Diploma'], ['2002', 'GAMMA SCHOOL', 'Certificate']];
  for (let i = 0; i < 3; i++) {
    await cards.nth(i).getByLabel('Year or dates').fill(vals[i][0]);
    await cards.nth(i).getByLabel('Institution').fill(vals[i][1]);
    await cards.nth(i).getByLabel('Qualification / course').fill(vals[i][2]);
  }
  await settle(page);
  const order = async () => (await preview(page).locator('.edu-inst').allInnerTexts()).map((x) => x.trim());
  ok(JSON.stringify(await order()) === JSON.stringify(['ALPHA UNIVERSITY', 'BETA COLLEGE', 'GAMMA SCHOOL']), 'education renders in entered order');
  ok((await preview(page).locator('.sl li').count()) === 4, 'multi-line qualification becomes separate bullets');
  await cards.nth(0).getByRole('button', { name: /Move education 1 down/i }).click(); await settle(page);
  ok(JSON.stringify(await order()) === JSON.stringify(['BETA COLLEGE', 'ALPHA UNIVERSITY', 'GAMMA SCHOOL']), 'move down reorders the CV');
  await e.locator('.ui-item').nth(2).getByRole('button', { name: /Move education 3 up/i }).click(); await settle(page);
  ok(JSON.stringify(await order()) === JSON.stringify(['BETA COLLEGE', 'GAMMA SCHOOL', 'ALPHA UNIVERSITY']), 'move up reorders the CV');
  await e.locator('.ui-item').nth(1).getByRole('button', { name: /Delete education 2/i }).click(); await settle(page);
  ok(JSON.stringify(await order()) === JSON.stringify(['BETA COLLEGE', 'ALPHA UNIVERSITY']), 'delete removes the entry');
  await page.getByRole('button', { name: 'Undo' }).click(); await settle(page);
  ok((await order()).length === 3, 'undo restores the deleted entry');
  await e.locator('.ui-item').nth(2).getByRole('button', { name: /Delete education 3/i }).click();
  await e.locator('.ui-item').nth(1).getByRole('button', { name: /Delete education 2/i }).click();
  await e.locator('.ui-item').nth(0).getByRole('button', { name: /Delete education 1/i }).click(); await settle(page);
  ok((await preview(page).locator('.edu').count()) === 0 && !(await preview(page).innerText()).toUpperCase().includes('EDUCATION'), 'deleting all entries removes the empty section (no orphan heading)');
  await page.getByRole('button', { name: 'Undo' }).click(); await settle(page);
}

section('5. Work experience, skills, languages, references, extra sections');
{
  const w = await openSec(page, 'work');
  await w.getByRole('button', { name: 'Add job' }).click(); await settle(page);
  const job = w.locator('.ui-item').first();
  await job.getByLabel('Organisation').fill('Analytical Engines Ltd');
  await job.getByLabel('Job title').fill('Lead Programmer');
  await job.getByLabel('Employment dates').fill('JAN 2020 - DEC 2022');
  await job.getByLabel('Responsibilities').fill('Wrote the first algorithm.\nReviewed engine designs.');
  await job.getByLabel('Achievements (optional)').fill('Published the notes.'); await settle(page);
  ok((await preview(page).locator('.wb').count()) === 3, 'responsibilities + achievements become 3 bullets');
  const t = await preview(page).innerText();
  ok(t.includes('Analytical Engines Ltd') && t.includes('Lead Programmer') && t.toUpperCase().includes('JAN 2020 - DEC 2022'), 'job organisation, title and dates render');

  const sk = await openSec(page, 'skills');
  await sk.getByRole('button', { name: 'Add skill' }).click();
  await page.keyboard.type('Mathematics'); await page.keyboard.press('Enter'); await page.keyboard.type('Logic'); await settle(page);
  ok((await preview(page).locator('.sk').count()) === 2, 'Enter in a skill adds the next one; both render');
  await sk.locator('.ui-item').nth(0).getByRole('button', { name: /Delete skill 1/i }).click(); await settle(page);
  ok((await preview(page).locator('.sk').count()) === 1, 'skill deleted');

  const lg = await openSec(page, 'languages');
  await lg.getByRole('button', { name: 'Add language' }).click(); await page.keyboard.type('English (Fluent)'); await settle(page);
  ok((await preview(page).innerText()).includes('English (Fluent)'), 'language added');

  const rf = await openSec(page, 'references');
  await rf.getByRole('button', { name: 'Add reference' }).click();
  await rf.getByLabel('Name', { exact: true }).fill('Dr Charles Babbage');
  await rf.getByLabel('Organisation').fill('ROYAL SOCIETY');
  await rf.getByLabel('Phone', { exact: true }).fill('+44 1');
  await rf.getByLabel('Email', { exact: true }).fill('cb@example.org');
  await rf.getByLabel('Phone label').fill('Tel:'); await settle(page);
  const rt = await preview(page).innerText();
  ok(rt.includes('Dr Charles Babbage') && rt.includes('Tel:') && rt.includes('cb@example.org'), 'reference + editable labels render');

  const ex = await openSec(page, 'extras');
  await ex.getByRole('button', { name: '+ Certifications' }).click();
  await ex.getByRole('textbox', { name: 'Item 1' }).fill('Chartered Engineer'); await settle(page);
  ok((await preview(page).innerText()).toUpperCase().includes('CERTIFICATIONS') && (await preview(page).innerText()).includes('Chartered Engineer'), 'extra section (main column list) renders');
  await ex.getByRole('button', { name: '+ Interests' }).click();
  await ex.locator('.ui-sec-body > .ui-items > .ui-item').nth(1).getByRole('textbox', { name: 'Item 1' }).fill('Chess'); await settle(page);
  ok((await preview(page).locator('.cv-side').innerText()).includes('Chess'), 'extra sidebar section renders in the sidebar');
  await ex.locator('.ui-sec-body > .ui-items > .ui-item').nth(1).locator('select').first().selectOption('main'); await settle(page);
  ok(!(await preview(page).locator('.cv-side').innerText()).includes('Chess'), 'changing column moves the section to the main column');
  await ex.locator('.ui-sec-body > .ui-items > .ui-item').nth(1).getByRole('button', { name: 'Delete section' }).click(); await settle(page);
  ok(!(await preview(page).innerText()).includes('Chess'), 'extra section deleted');
}

section('6. Autosave, reload, backup, reset confirmation');
{
  await page.waitForTimeout(700);
  ok(/Saved/.test(await page.locator('#save-status').innerText()), 'status shows Saved on this device');
  await page.reload(); await page.waitForSelector('#editor-root .ui-sec'); await settle(page);
  ok((await preview(page).innerText()).includes('Analytical Engines Ltd'), 'content is restored after reload');
  ok(await preview(page).locator('.photo-img img').count() === 1, 'photo is restored after reload');
  await page.locator('#menu summary').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#m-backup').click()]);
  const bf = path.join(OUT, 'backup.json'); await dl.saveAs(bf);
  ok(JSON.parse(readFileSync(bf, 'utf8')).person.firstName === 'Ada', 'backup JSON downloads with the data');
  await page.locator('#menu summary').click(); await page.locator('#m-reset').click();
  ok(await page.locator('dialog.ui-dialog[open]').isVisible(), 'reset asks for confirmation');
  await page.locator('dialog button[value=cancel]').click(); await settle(page);
  ok((await preview(page).innerText()).includes('Analytical Engines Ltd'), 'cancelling reset keeps the data');
  await page.locator('#menu summary').click(); await page.locator('#m-reset').click(); await page.locator('dialog button[value=ok]').click(); await settle(page);
  ok(!(await preview(page).innerText()).includes('Analytical Engines Ltd') && await page.locator('#empty-banner').isVisible(), 'confirmed reset clears the CV');
  // restore from backup
  await page.locator('#menu summary').click();
  const fc = page.waitForEvent('filechooser'); await page.locator('#m-restore').click(); (await fc).setFiles(bf); await settle(page);
  ok((await preview(page).innerText()).includes('Analytical Engines Ltd'), 'backup file restores the CV');
}

section('7. PDF export of the edited CV');
{
  const f = await downloadPdf(page, 'edited.pdf');
  const i = pdfInfo(f);
  ok(i.pages === 1, `PDF has ${i.pages} page`);
  ok(Math.abs(i.size[0] - 595) < 2 && Math.abs(i.size[1] - 842) < 2, `PDF page size is A4 (${i.size.join(' x ')} pt)`);
  ok(/Analytical Engines Ltd/.test(i.text) && /Lead Programmer/.test(i.text) && /ada@example\.org/.test(i.text) && /Dr Charles Babbage/.test(i.text), 'PDF has selectable text for the content');
  ok(!/Add your|Your professional title|Phone number/.test(i.text), 'no preview placeholders leak into the PDF');
  ok(/Lato/.test(i.fonts) && !/Type 3/.test(i.fonts), 'fonts are embedded (no Type 3 fallbacks)');
  sh('pdftoppm', '-r', '80', '-png', f, path.join(OUT, 'edited'));
  console.log('  inspect:', path.join(OUT, 'edited-1.png'));
}

section('8. Long text, unbroken strings, empty fields, many entries -> multiple pages');
let multiPdf;
{
  const p2 = await open({}, fixture); await settle(p2);
  ok((await pageCount(p2)) === 1, "the original CV's content fits on one page, as in the original");
  const f1 = await downloadPdf(p2, 'original-content.pdf');
  ok(pdfInfo(f1).pages === 1 && /DSV pipetronix Ltd/.test(pdfInfo(f1).text), 'PDF of the original content is 1 page');
  sh('pdftoppm', '-r', '100', '-png', f1, path.join(OUT, 'original-content'));
  // stress
  const w = await openSec(p2, 'work');
  const longLine = 'Delivered a very detailed programme of work across many sites with careful coordination between teams and stakeholders. '.repeat(3).trim();
  for (let i = 0; i < 6; i++) {
    await w.getByRole('button', { name: 'Add job' }).click();
    const last = w.locator('.ui-item').last();
    await last.getByLabel('Organisation').fill(`Stress Test Company Number ${i + 1} International Holdings`);
    await last.getByLabel('Job title').fill('Senior Principal Lead Engineer');
    await last.getByLabel('Employment dates').fill('JAN 2010 - DEC 2012');
    await last.getByLabel('Responsibilities').fill([longLine, longLine, 'Short bullet.', 'A'.repeat(140)].join('\n'));
  }
  const sk = await openSec(p2, 'skills');
  for (let i = 0; i < 22; i++) { await sk.getByRole('button', { name: 'Add skill' }).click(); await p2.keyboard.type(`Extra skill number ${i + 1}`); }
  const ed = await openSec(p2, 'education');
  await ed.locator('.ui-item').first().getByLabel('Institution').fill('AN EXTREMELY LONG INSTITUTION NAME OF UNIVERSITY OF TECHNOLOGY AND APPLIED SCIENCES' + 'X'.repeat(60));
  await settle(p2); await p2.waitForTimeout(500);
  const n = await pageCount(p2);
  ok(n >= 3, `content overflow continues onto extra pages (${n} pages in preview)`);
  // no element overflows its page horizontally; text not clipped on the right
  const overflow = await p2.evaluate(() => {
    const bad = [];
    document.querySelectorAll('#cv .cv-page').forEach((pg, pi) => {
      const pr = pg.getBoundingClientRect();
      pg.querySelectorAll('.atom *').forEach((el) => { if (el.closest('.photo-img')) return; const r = el.getBoundingClientRect(); if (r.width && (r.right > pr.right + 1 || r.left < pr.left - 1)) bad.push(`p${pi + 1} ${el.className || el.tagName}`); });
      pg.querySelectorAll('.atom').forEach((a) => { const r = a.getBoundingClientRect(); if (r.bottom > pr.bottom + 1) bad.push(`p${pi + 1} atom below page`); });
    });
    return bad;
  });
  ok(overflow.length === 0, `no content spills outside any page${overflow.length ? ': ' + overflow.slice(0, 4).join(', ') : ''}`);
  multiPdf = await downloadPdf(p2, 'multipage.pdf');
  const mi = pdfInfo(multiPdf);
  ok(mi.pages === n, `PDF page count (${mi.pages}) equals preview page count (${n})`);
  ok(/Stress Test Company Number 6/.test(mi.text) && /Extra skill number 22/.test(mi.text), 'PDF contains the content from the last page (nothing lost)');
  ok(/A{140}/.test(mi.text.replace(/\s+/g, '')) , 'a 140-character unbroken word is present in full');
  sh('pdftoppm', '-r', '60', '-png', multiPdf, path.join(OUT, 'multipage'));
  console.log('  inspect:', path.join(OUT, 'multipage-*.png'));
  await p2.screenshot({ path: path.join(OUT, 'app-multipage.png') });
  await p2.context().close();
}

section('9. Empty fields');
{
  const p3 = await open({}, { v: 1, person: { firstName: 'Only', otherNames: '', title: '', phone: '', email: '', address: '' } }); await settle(p3);
  const t = await preview(p3).innerText();
  ok(t.toUpperCase().includes('ONLY') && !/EDUCATION|WORK EXPERIENCE|REFERENCE|SKILLS/i.test(t.replace(/Your professional title/, '')), 'empty sections are omitted, no orphan headings');
  const f = await downloadPdf(p3, 'name-only.pdf');
  const i = pdfInfo(f);
  ok(i.pages === 1 && /Only/i.test(i.text), 'name-only CV exports cleanly (1 page)');
  await p3.context().close();
}

section('10. Mobile layout');
{
  const m = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, fixture); await settle(m);
  ok(await m.locator('.ui-editor-pane').isVisible() && !(await m.locator('.ui-preview-pane').isVisible()), 'mobile starts on the Edit tab');
  const hs = await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok(hs, 'no horizontal scrolling on mobile (edit)');
  await m.locator('.ui-tab[data-tab=preview]').click(); await settle(m);
  ok(await m.locator('.ui-preview-pane').isVisible() && !(await m.locator('.ui-editor-pane').isVisible()), 'Preview tab shows the CV');
  const w = await m.locator('.ui-frame').evaluate((e) => e.getBoundingClientRect().width);
  ok(w > 340 && w <= 390, `preview scales to the phone width (${Math.round(w)}px)`);
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal scrolling on mobile (preview)');
  await m.screenshot({ path: path.join(OUT, 'mobile-preview.png') });
  await m.locator('.ui-tab[data-tab=edit]').click(); await m.locator('.ui-sec[data-key=work] summary').click(); await settle(m);
  await m.screenshot({ path: path.join(OUT, 'mobile-work.png') });
  await m.context().close();
}

section('11. Server safety');
{
  const r1 = await fetch(BASE + 'api/pdf', { method: 'POST', body: 'not json' });
  ok(r1.status === 400, 'invalid body returns 400 (not a crash)');
  const r2 = await fetch(BASE + 'api/pdf', { method: 'POST', body: JSON.stringify({ person: { firstName: '<script>alert(1)</script>' }, photo: { src: 'https://evil.example/x.png' } }) });
  const buf = Buffer.from(await r2.arrayBuffer()); const f = path.join(OUT, 'xss.pdf'); writeFileSync(f, buf);
  ok(r2.status === 200 && /<script>alert\(1\)<\/script>/i.test(pdfInfo(f).text), 'HTML in text fields is escaped, external photo URLs are ignored');
}

await browser.close(); srv.close();
console.log(`\nJS errors during run: ${errors.length}`); errors.slice(0, 5).forEach((e) => console.log('  ', e));
console.log(`\n${pass} passed, ${fail} failed. Artifacts in ${OUT}`);
process.exit(fail || errors.length ? 1 : 0);
