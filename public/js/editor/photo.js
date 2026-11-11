/* Photo upload + crop editor. The photo never leaves the browser: it is downscaled on a canvas and kept
   in the CV object (and local storage) as a data URL. Position/zoom use the same maths as the template. */
import { h, btn, toast } from './ui.js';
import { imageDims } from '../template/render.js';
import { photoRect, photoStyle, PHOTO_D_PT } from '../template/cvTemplate.js';

const MAX_SIDE = 1000;
const MAX_FILE = 15 * 1024 * 1024;

async function fileToDataURL(file) {
  if (!/^image\/(jpeg|png|webp|gif|bmp|avif)$/i.test(file.type)) throw new Error('Please choose a JPG, PNG or WebP image.');
  if (file.size > MAX_FILE) throw new Error('That image is over 15 MB. Please choose a smaller one.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('That file could not be read as an image.')); im.src = url; });
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.9);
  } finally { URL.revokeObjectURL(url); }
}

export function photoEditor(store) {
  const root = h('div', { class: 'ui-photo' });
  const fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'ui-sr', 'aria-label': 'Choose photograph' });
  const crop = h('div', { class: 'ui-crop', tabIndex: 0, role: 'group', 'aria-label': 'Photo crop area. Drag to reposition, use arrow keys to nudge, plus and minus to zoom.' });
  const img = h('img', { alt: '' });
  crop.append(img);
  const zoom = h('input', { type: 'range', min: 1, max: 6, step: 0.01, value: 1, 'aria-label': 'Zoom' });
  const empty = h('div', { class: 'ui-crop-empty' }, h('strong', null, 'No photo yet'), h('span', null, 'Upload a clear head-and-shoulders photo. It is cropped to the circle on your CV.'));
  const controls = h('div', { class: 'ui-crop-controls' });
  const msg = h('p', { class: 'ui-error', role: 'alert' });
  let dims = null;

  const photo = () => store.cv.photo;

  function paint() {
    const p = photo();
    root.classList.toggle('has', !!p);
    if (!p || !dims) return;
    if (img.getAttribute('src') !== p.src) img.src = p.src;
    img.style.cssText = photoStyle(p, dims);
    zoom.value = p.zoom;
  }

  async function sync() {
    const p = photo();
    dims = p ? await imageDims(p.src) : null;
    paint();
  }

  async function onFile(file) {
    msg.textContent = '';
    if (!file) return;
    try {
      const src = await fileToDataURL(file);
      store.update((cv) => { cv.photo = { src, zoom: 1, cx: 0.5, cy: 0.5 }; });
      await sync();
    } catch (e) { msg.textContent = e.message || 'Could not use that image.'; }
    fileInput.value = '';
  }
  fileInput.addEventListener('change', () => onFile(fileInput.files[0]));

  // ---- drag to reposition ----
  function moveBy(dxPt, dyPt) {
    const p = photo(); if (!p || !dims) return;
    const r = photoRect(p, dims);
    const left = Math.min(0, Math.max(PHOTO_D_PT - r.w, r.left + dxPt));
    const top = Math.min(0, Math.max(PHOTO_D_PT - r.h, r.top + dyPt));
    store.update((cv) => { cv.photo.cx = (PHOTO_D_PT / 2 - left) / r.w; cv.photo.cy = (PHOTO_D_PT / 2 - top) / r.h; });
    paint();
  }
  let drag = null;
  crop.addEventListener('pointerdown', (e) => { if (!photo()) return; drag = { x: e.clientX, y: e.clientY }; crop.setPointerCapture(e.pointerId); crop.classList.add('drag'); });
  crop.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const k = PHOTO_D_PT / crop.clientWidth;
    moveBy((e.clientX - drag.x) * k, (e.clientY - drag.y) * k);
    drag = { x: e.clientX, y: e.clientY };
  });
  const end = () => { drag = null; crop.classList.remove('drag'); };
  crop.addEventListener('pointerup', end); crop.addEventListener('pointercancel', end);

  function setZoom(z) {
    if (!photo()) return;
    store.update((cv) => { cv.photo.zoom = Math.min(6, Math.max(1, z)); });
    paint();
  }
  zoom.addEventListener('input', () => setZoom(Number(zoom.value)));
  crop.addEventListener('wheel', (e) => { if (!photo()) return; e.preventDefault(); setZoom(photo().zoom * (e.deltaY < 0 ? 1.06 : 0.94)); }, { passive: false });
  crop.addEventListener('keydown', (e) => {
    const step = 2;
    const m = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (m) { e.preventDefault(); moveBy(...m); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(photo().zoom * 1.1); }
    else if (e.key === '-') { e.preventDefault(); setZoom(photo().zoom / 1.1); }
  });

  const pick = () => fileInput.click();
  const uploadBtn = btn('Upload photo', { kind: 'primary', onClick: pick });
  const replaceBtn = btn('Replace', { onClick: pick });
  const resetBtn = btn('Re-centre', { onClick: () => { store.update((cv) => { cv.photo.zoom = 1; cv.photo.cx = 0.5; cv.photo.cy = 0.5; }); paint(); } });
  const removeBtn = btn('Remove', {
    kind: 'danger-ghost',
    onClick: () => {
      const old = photo();
      store.update((cv) => { cv.photo = null; });
      sync();
      toast('Photo removed.', { action: 'Undo', onAction: () => { store.update((cv) => { cv.photo = old; }); sync(); } });
    },
  });

  controls.append(
    h('label', { class: 'ui-zoom' }, h('span', null, 'Zoom'), btn('−', { title: 'Zoom out', onClick: () => setZoom((photo()?.zoom || 1) / 1.1) }), zoom, btn('+', { title: 'Zoom in', onClick: () => setZoom((photo()?.zoom || 1) * 1.1) })),
    h('p', { class: 'ui-hint' }, 'Drag the photo to reposition it. Scroll or use the slider to zoom.'),
    h('div', { class: 'ui-row' }, replaceBtn, resetBtn, removeBtn));

  root.append(h('div', { class: 'ui-photo-stage' }, crop, empty), h('div', { class: 'ui-photo-side' }, h('div', { class: 'ui-row ui-only-empty' }, uploadBtn), controls, msg), fileInput);
  sync();
  root.refresh = sync; // call after the CV is replaced (reset / import / example)
  return root;
}
