/* Mounts the CV (all pages) into a container. Used by the live preview, the landing page and the PDF renderer. */
import { buildLayout } from './cvTemplate.js';
import { paginate, atomHTML } from './paginate.js';

const FACES = ['400 10pt "CV Body"', '700 10pt "CV Body"', '300 10pt "CV Display"', '400 10pt "CV Display"', '700 10pt "CV Display"', '400 10pt "CV Work"', '700 10pt "CV Work"'];
let fontsReady;
export function ensureFonts() {
  if (!fontsReady) fontsReady = Promise.all(FACES.map((f) => document.fonts.load(f, 'AaBb0123 ÀÉ'))).then(() => document.fonts.ready).catch(() => {});
  return fontsReady;
}

const dimCache = new Map();
export function imageDims(src) {
  if (dimCache.has(src)) return dimCache.get(src);
  const p = new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => resolve(null);
    im.src = src;
  });
  dimCache.set(src, p);
  if (dimCache.size > 8) dimCache.delete(dimCache.keys().next().value);
  return p;
}

function groupTimeline(atoms) {
  let out = '';
  let open = false;
  atoms.forEach((a, i) => {
    if (a.tl && !open) { out += `<div class="tl${a.tlStart ? ' first' : ''}">`; open = true; }
    if (!a.tl && open) { out += '</div>'; open = false; }
    out += atomHTML(a);
  });
  if (open) out += '</div>';
  return out;
}

export function pageHTML(pg) {
  return `<section class="cv-page"><div class="cv-side"><div class="cv-side-inner" style="top:${pg.sideTop}pt">${pg.side.map(atomHTML).join('')}</div></div><div class="cv-main-inner" style="top:${pg.mainTop}pt">${groupTimeline(pg.main)}</div></section>`;
}

/** Renders `cv` into `mount`. Resolves with { pages } once fonts and the photo are ready. */
export async function renderCV(cv, mount, { ghost = false } = {}) {
  await ensureFonts();
  const photoDims = cv.photo ? await imageDims(cv.photo.src) : null;
  const layout = buildLayout(cv, { ghost, photoDims });
  const pages = paginate(layout);
  mount.classList.add('cv-root');
  mount.innerHTML = pages.map(pageHTML).join('');
  const imgs = [...mount.querySelectorAll('img')];
  await Promise.all(imgs.map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.onload = im.onerror = r; }))));
  await Promise.all(imgs.map((im) => (im.decode ? im.decode().catch(() => {}) : null)));
  return { pages: pages.length };
}
