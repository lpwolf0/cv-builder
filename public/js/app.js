/* App shell: landing <-> editor navigation, header actions (save / backup / reset / PDF), progress, mobile tabs. */
import { createStore } from './store.js';
import { buildEditor } from './editor/editor.js';
import { createPreview } from './preview.js';
import { renderCV } from './template/render.js';
import { progress } from './progress.js';
import { blankCV, sanitizeCV } from './model.js';
import { toast, confirmDialog } from './editor/ui.js';

const $ = (s, r = document) => r.querySelector(s);
const store = createStore();

const landing = $('#landing');
const app = $('#app');
let editor = null;
let preview = null;

/* ---------------- landing ---------------- */
async function initLanding() {
  const startBtns = document.querySelectorAll('[data-start]');
  startBtns.forEach((b) => { if (store.hadSaved) b.textContent = b.dataset.continue || b.textContent; b.addEventListener('click', () => { location.hash = '#build'; }); });
  try {
    const ex = await (await fetch('data/example-cv.json')).json();
    await renderCV(sanitizeCV(ex), $('#hero-cv'), { ghost: false });
    $('#hero-page').classList.add('ready');
  } catch (e) { console.warn('Example preview unavailable', e); }
}

/* ---------------- navigation ---------------- */
function route() {
  const build = location.hash === '#build';
  landing.hidden = build;
  app.hidden = !build;
  document.body.classList.toggle('in-app', build);
  if (build) { ensureApp(); window.scrollTo(0, 0); preview && preview.fit(); } else document.title = 'CV Builder';
  if (build) document.title = 'Build your CV · CV Builder';
}
window.addEventListener('hashchange', route);

/* ---------------- app ---------------- */
function ensureApp() {
  if (editor) return;
  editor = buildEditor($('#editor-root'), store);
  editor.openFirst();
  preview = createPreview($('#preview-scroller'), store, { onPages: (n) => { $('#page-count').textContent = `${n} ${n === 1 ? 'page' : 'pages'}`; } });
  store.subscribe(updateProgress);
  updateProgress();
  store.onStatus(showStatus); showStatus(store.status);
  wireHeader();
  wireTabs();
  wireZoom();
}

function updateProgress() {
  const p = progress(store.cv);
  const bar = $('#progress');
  bar.setAttribute('aria-valuenow', p.pct);
  bar.style.setProperty('--p', `${p.pct}%`);
  $('#progress-label').textContent = `${p.done} of ${p.total} parts filled`;
  $('#empty-banner').hidden = p.done > 0;
}

function showStatus(s) {
  const el = $('#save-status');
  el.dataset.state = s.state;
  el.textContent = s.state === 'saving' ? 'Saving…' : s.state === 'error' ? 'Could not save in this browser. Download a backup.' : s.state === 'saved' ? 'Saved on this device' : 'Not saved yet';
}

async function replaceCV(next, { clear = false } = {}) {
  store.replace(next);
  if (clear) store.clearSaved();
  editor.rebuild();
  preview.refresh();
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function loadExample() {
  if (progress(store.cv).done > 0 && !(await confirmDialog({ title: 'Replace your CV with the example?', text: 'This overwrites what you have entered so far.', confirmLabel: 'Use example', danger: true }))) return;
  try {
    const ex = await (await fetch('data/example-cv.json')).json();
    await replaceCV(ex);
    toast('Example loaded. Replace it with your own details.');
  } catch { toast('Could not load the example.'); }
}

async function pdf() {
  const btns = document.querySelectorAll('[data-pdf]');
  if (progress(store.cv).done === 0) { toast('Add some details first, then download your CV.'); return; }
  btns.forEach((b) => { b.disabled = true; b.dataset.label = b.dataset.label || b.textContent; b.textContent = 'Preparing PDF…'; });
  try {
    store.saveNow();
    const res = await fetch('api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(store.cv) });
    if (!res.ok) {
      let msg = 'Could not generate the PDF. Please try again.';
      try { msg = (await res.json()).error || msg; } catch { /* not json */ }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const m = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '');
    download(blob, m ? m[1] : 'CV.pdf');
    toast(`PDF downloaded (${res.headers.get('X-CV-Pages') || '?'} page${res.headers.get('X-CV-Pages') === '1' ? '' : 's'}).`);
  } catch (e) {
    toast(e instanceof TypeError ? 'Could not reach the PDF service. Check your connection and try again.' : e.message, { ms: 8000 });
  } finally {
    btns.forEach((b) => { b.disabled = false; b.textContent = b.dataset.label; });
  }
}

function wireHeader() {
  document.querySelectorAll('[data-pdf]').forEach((b) => b.addEventListener('click', pdf));
  $('#btn-save').addEventListener('click', () => { toast(store.saveNow() ? 'Progress saved on this device.' : 'Could not save in this browser. Download a backup instead.'); });
  const menu = $('#menu');
  const close = () => { menu.open = false; };
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) close(); });
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); $('summary', menu).focus(); } });
  $('#m-example').addEventListener('click', () => { close(); loadExample(); });
  $('#m-backup').addEventListener('click', () => {
    close();
    download(new Blob([JSON.stringify(store.cv)], { type: 'application/json' }), `cv-backup-${new Date().toISOString().slice(0, 10)}.json`);
  });
  const file = $('#m-file');
  $('#m-restore').addEventListener('click', () => { close(); file.click(); });
  file.addEventListener('change', async () => {
    const f = file.files[0]; file.value = '';
    if (!f) return;
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error('too large');
      const data = JSON.parse(await f.text());
      if (!data || typeof data !== 'object' || !data.person) throw new Error('not a CV');
      await replaceCV(data);
      toast('Backup loaded.');
    } catch { toast('That file is not a valid CV backup.'); }
  });
  $('#m-reset').addEventListener('click', async () => {
    close();
    if (await confirmDialog({ title: 'Reset your CV?', text: 'This clears everything you have entered on this device, including your photo and saved progress. It cannot be undone.', confirmLabel: 'Reset CV', danger: true })) {
      await replaceCV(blankCV(), { clear: true });
      toast('CV reset.');
    }
  });
  $('#btn-example').addEventListener('click', loadExample);
}

function wireTabs() {
  const tabs = document.querySelectorAll('.ui-tab');
  tabs.forEach((t) => t.addEventListener('click', () => {
    app.dataset.tab = t.dataset.tab;
    tabs.forEach((x) => x.setAttribute('aria-selected', String(x === t)));
    if (t.dataset.tab === 'preview') requestAnimationFrame(() => preview.fit());
    window.scrollTo(0, 0);
  }));
}

function wireZoom() {
  let z = 1;
  const apply = (v) => { z = v; preview.setZoom(v); };
  $('#z-fit').addEventListener('click', () => apply('fit'));
  $('#z-in').addEventListener('click', () => apply(Math.min(2, (parseFloat($('#preview-scroller').style.getPropertyValue('--ui-scale')) || 1) * 1.15)));
  $('#z-out').addEventListener('click', () => apply(Math.max(0.3, (parseFloat($('#preview-scroller').style.getPropertyValue('--ui-scale')) || 1) / 1.15)));
}

window.addEventListener('pagehide', () => store.saveNow());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.saveNow(); });

initLanding();
route();
