/* Page-overflow engine.
   Takes the atoms from cvTemplate and flows them onto A4 pages, column by column.
   Blocks are never split mid-way and never shrunk: when something does not fit it moves to the
   next page, where the same sidebar / column styling continues. Headings stay with their first item. */
const PT = 4 / 3; // px per pt
export const PAGE_H = (297 / 25.4) * 96; // px

const TOP_PT = { sideFirstWithPhoto: 0, other: 36, mainFirstWithHeader: 78.5 };
const BOTTOM_PT = 12;

export function colTop(col, pageIdx, atoms) {
  if (pageIdx === 0) {
    if (col === 'side' && atoms[0] && atoms[0].photo) return TOP_PT.sideFirstWithPhoto;
    if (col === 'side' && atoms[0] && atoms[0].html && atoms[0].html.includes('photo-ghost')) return 0;
    if (col === 'main' && atoms[0] && atoms[0].header) return TOP_PT.mainFirstWithHeader;
  }
  return TOP_PT.other;
}

let measurer;
function getMeasurer() {
  if (measurer && measurer.isConnected) return measurer;
  measurer = document.createElement('div');
  measurer.className = 'cv-root';
  measurer.setAttribute('aria-hidden', 'true');
  measurer.style.cssText = 'position:absolute;left:-20000px;top:0;visibility:hidden;pointer-events:none;width:210mm;';
  measurer.innerHTML = '<div data-col="side" class="cv-side-inner" style="position:relative;left:0"></div><div data-col="main" class="cv-main-inner" style="position:relative;left:0"></div>';
  document.body.appendChild(measurer);
  return measurer;
}

export const atomHTML = (a) => `<div class="atom"${a.gap ? ` style="padding-top:${a.gap}pt"` : ''}>${a.html}</div>`;

function measure(col, atoms) {
  const host = getMeasurer().querySelector(`[data-col="${col}"]`);
  host.innerHTML = atoms.map(atomHTML).join('');
  const kids = host.children;
  const hs = atoms.map((a, i) => kids[i].getBoundingClientRect().height);
  host.innerHTML = ''; // keep the off-screen measurer empty so it can never add blank pages to a printout
  return hs;
}

function flow(col, atoms) {
  if (!atoms.length) return [[]];
  const heights = measure(col, atoms);
  const gapPx = atoms.map((a) => (a.gap || 0) * PT);
  const pages = [[]];
  let y = 0;
  const availFor = (pi) => PAGE_H - colTop(col, pi, atoms) * PT - BOTTOM_PT * PT;
  let i = 0;
  while (i < atoms.length) {
    // build a group: this atom + following atoms while "keep with next" is set (headings with their first item)
    let j = i;
    while (j < atoms.length - 1 && atoms[j].keep && !atoms[j].header) j++;
    const atPageTop = pages[pages.length - 1].length === 0;
    const groupH = (from, top) => { let h = 0; for (let k = from; k <= j; k++) h += heights[k] - (k === from && top ? gapPx[k] : 0); return h; };
    const pi = pages.length - 1;
    if (!atPageTop && y + groupH(i, false) > availFor(pi) + 0.5) {
      pages.push([]); y = 0;
    }
    const top = pages[pages.length - 1].length === 0;
    y += groupH(i, top);
    for (let k = i; k <= j; k++) pages[pages.length - 1].push({ ...atoms[k], gap: k === i && top ? 0 : atoms[k].gap });
    i = j + 1;
  }
  return pages;
}

export function paginate(layout) {
  const side = flow('side', layout.side);
  const main = flow('main', layout.main);
  const n = Math.max(side.length, main.length);
  const pages = [];
  for (let i = 0; i < n; i++) pages.push({ side: side[i] || [], main: main[i] || [], sideTop: colTop('side', i, layout.side), mainTop: colTop('main', i, layout.main) });
  return pages;
}
