/* Live preview: renders the real template (same code the PDF export uses) and scales it to the pane. */
import { renderCV } from './template/render.js';

const PAGE_PX = (210 / 25.4) * 96;

export function createPreview(scroller, store, { onPages } = {}) {
  const frame = scroller.querySelector('.ui-frame');
  const mount = scroller.querySelector('.ui-mount');
  let rendering = false, dirty = false, timer = null, pages = 0, zoomMode = 'fit', manual = 1;

  function fit() {
    const avail = scroller.clientWidth - (scroller.clientWidth < 700 ? 24 : 48);
    if (avail <= 0) return;
    const s = zoomMode === 'fit' ? Math.min(1.25, avail / PAGE_PX) : manual;
    mount.style.transform = `scale(${s})`;
    frame.style.width = `${PAGE_PX * s}px`;
    frame.style.height = `${mount.offsetHeight * s}px`;
    scroller.style.setProperty('--ui-scale', s);
  }

  async function run() {
    if (rendering) { dirty = true; return; }
    rendering = true;
    try {
      do {
        dirty = false;
        const r = await renderCV(JSON.parse(JSON.stringify(store.cv)), mount, { ghost: true });
        pages = r.pages;
        fit();
        onPages && onPages(pages);
      } while (dirty);
    } catch (e) {
      console.error('Preview failed', e);
    } finally { rendering = false; }
  }

  const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 90); };
  store.subscribe(schedule);
  new ResizeObserver(fit).observe(scroller);
  run();

  return {
    refresh: run,
    fit,
    setZoom(z) { if (z === 'fit') zoomMode = 'fit'; else { zoomMode = 'manual'; manual = z; } fit(); },
    get pages() { return pages; },
  };
}
