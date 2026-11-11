/* Template rendering logic: CV data  ->  a flat list of "atoms" (unbreakable blocks) per column.
   No DOM measurement and no editor code in here. The pagination engine places atoms onto pages. */
import { lines } from '../model.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const multi = (s) => esc(s).replace(/\r?\n/g, '<br>');

const ICONS = {
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
};

/** Photo is positioned by percentages of its circle so it scales with the page, preview and PDF alike. */
export const PHOTO_D_PT = 121; // diameter of the visible photo circle inside the white ring

/** Position/size of the photo (in pt, relative to the visible circle). Shared by the template and the cropper UI. */
export function photoRect(photo, dims) {
  const base = PHOTO_D_PT / Math.min(dims.w, dims.h); // "cover" scale in pt per image px
  const scale = base * photo.zoom;
  const w = dims.w * scale, h = dims.h * scale;
  const left = Math.min(0, Math.max(PHOTO_D_PT - w, PHOTO_D_PT / 2 - photo.cx * w));
  const top = Math.min(0, Math.max(PHOTO_D_PT - h, PHOTO_D_PT / 2 - photo.cy * h));
  return { w, h, left, top };
}

export function photoStyle(photo, dims) {
  if (!dims) return '';
  const { w, h, left, top } = photoRect(photo, dims);
  const pc = (v) => `${((v / PHOTO_D_PT) * 100).toFixed(4)}%`;
  return `width:${pc(w)};height:${pc(h)};left:${pc(left)};top:${pc(top)}`;
}

function photoAtom(cv, ghost, dims) {
  const p = cv.photo;
  if (!p) {
    if (!ghost) return null;
    return { html: '<div class="photo"><div class="photo-ring"><div class="photo-img photo-ghost">Add your<br>photo</div></div></div>', gap: 0 };
  }
  // The <img> is sized/positioned by the pagination step once its natural size is known (data-* attrs).
  return {
    html: `<div class="photo"><div class="photo-ring"><div class="photo-img"><img alt="Profile photograph" src="${esc(p.src)}" style="${photoStyle(p, dims)}"></div></div></div>`,
    gap: 0, photo: true,
  };
}

const ghostify = (txt, fallback, ghost, cls = '') => (txt ? txt : ghost ? `<span class="ghost ${cls}">${fallback}</span>` : '');

function sideHeading(text) { return { html: `<div class="sh">${esc(text)}</div>`, keep: true }; }
function mainHeading(text, gap) { return { html: `<div class="mh">${esc(text)}</div>`, keep: true, gap }; }

export function buildLayout(cv, { ghost = false, photoDims = null } = {}) {
  const side = [];
  const main = [];
  // vertical gap (pt) before each section heading, measured from the original design
  const GAP = { contact: 0, education: 19.4, skills: 21, languages: 24, profile: 42, work: 40.8, reference: 14.5 };
  const customGap = (c) => (c.column === 'main' ? 28 : 24);

  // ----- header (first page only) -----
  const first = cv.person.firstName.trim();
  const other = cv.person.otherNames.trim();
  const title = cv.person.title.trim();
  if (first || other || title || ghost) {
    const nameHtml = first || other
      ? `${first ? `<span class="n1">${esc(first)}</span>` : ''}${first && other ? ' ' : ''}${other ? `<span class="n2">${esc(other)}</span>` : ''}`
      : (ghost ? '<span class="ghost"><span class="n1">Your</span> <span class="n2">Name</span></span>' : '');
    const titleHtml = title ? esc(title) : ghost ? '<span class="ghost">Your professional title</span>' : '';
    main.push({
      html: `<div class="name-block">${nameHtml ? `<div class="name">${nameHtml}</div>` : ''}${titleHtml ? `<div class="jobtitle">${titleHtml}</div>` : ''}<div class="bar"></div></div>`,
      gap: 0, header: true,
    });
  }

  // ----- photo -----
  const pa = photoAtom(cv, ghost, photoDims);
  if (pa) side.push(pa);

  const sectionBuilders = {
    contact() {
      const out = [];
      const { phone, email, address } = cv.person;
      const rows = [['phone', phone, 'Phone number'], ['mail', email, 'Email address'], ['pin', address, 'Address']];
      const hasAny = rows.some((r) => r[1].trim());
      if (!hasAny && !ghost) return out;
      out.push({ ...sideHeading(cv.headings.contact), gap: 0 });
      rows.forEach(([ic, val, ph], i) => {
        const t = val.trim();
        if (!t && !ghost) return;
        const inner = t ? esc(t) : `<span class="ghost">${ph}</span>`;
        out.push({ html: `<div class="ci"><span class="ico">${ICONS[ic]}</span><span class="txt">${inner}</span></div>`, gap: out.length === 1 ? 8.6 : 15.8 });
      });
      return out;
    },
    education() {
      const out = [];
      if (!cv.education.length) return out;
      out.push({ ...sideHeading(cv.headings.education), gap: 0 });
      cv.education.forEach((e, i) => {
        const det = lines(e.details);
        if (!e.dates.trim() && !e.institution.trim() && !det.length) return;
        const html = `<div class="edu">${e.dates.trim() ? `<div class="edu-year">${esc(e.dates)}</div>` : ''}${e.institution.trim() ? `<div class="edu-inst">${esc(e.institution)}</div>` : ''}${det.length ? `<ul class="sl">${det.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}</div>`;
        out.push({ html, gap: i === 0 ? 12.4 : 14 });
      });
      return out;
    },
    skills() { return simpleList(cv.skills, cv.headings.skills, 'sk'); },
    languages() { return simpleList(cv.languages, cv.headings.languages, 'sk'); },
    profile() {
      const paras = lines(cv.profile);
      if (!paras.length && !ghost) return [];
      const out = [{ ...mainHeading(cv.headings.profile, 0) }];
      if (!paras.length) out.push({ html: '<p class="profile-p ghost">Write a short summary about yourself.</p>', gap: 3 });
      paras.forEach((p, i) => out.push({ html: `<p class="profile-p">${esc(p)}</p>`, gap: i === 0 ? 7.3 : 6 }));
      return out;
    },
    work() {
      const jobs = cv.work.filter((w) => w.organisation.trim() || w.role.trim() || w.dates.trim() || lines(w.responsibilities).length || lines(w.achievements).length);
      if (!jobs.length) return [];
      const out = [mainHeading(cv.headings.work, 0)];
      jobs.forEach((w, ji) => {
        const bullets = [...lines(w.responsibilities), ...lines(w.achievements)];
        const head = `<div class="job-head">${(w.organisation.trim() || w.dates.trim()) ? `<div class="job-row"><span class="job-org">${esc(w.organisation)}</span><span class="job-dates">${esc(w.dates)}</span></div>` : ''}${w.role.trim() ? `<div class="job-role">${esc(w.role)}</div>` : ''}</div>`;
        out.push({ html: head, gap: ji === 0 ? 5 : 12.5, tl: true, tlStart: ji === 0, keep: bullets.length > 0 });
        bullets.forEach((b, bi) => out.push({ html: `<div class="wb">${esc(b)}</div>`, gap: bi === 0 ? 2.3 : 0, tl: true }));
      });
      return out;
    },
    reference() {
      const refs = cv.references.filter((r) => r.name.trim() || r.organisation.trim() || r.phone.trim() || r.email.trim());
      if (!refs.length) return [];
      const out = [mainHeading(cv.headings.reference, 0)];
      refs.forEach((r, i) => {
        const html = `<div class="ref">${r.name.trim() ? `<div class="ref-name">${esc(r.name)}</div>` : ''}${r.organisation.trim() ? `<div class="ref-org">${esc(r.organisation)}</div>` : ''}${r.phone.trim() ? `<div class="ref-line"><span class="lbl">${esc(cv.labels.refPhone)}</span><span class="val">${esc(r.phone)}</span></div>` : ''}${r.email.trim() ? `<div class="ref-line"><span class="lbl">${esc(cv.labels.refEmail)}</span><span class="val">${esc(r.email)}</span></div>` : ''}</div>`;
        out.push({ html, gap: i === 0 ? 9 : 10 });
      });
      return out;
    },
  };

  function simpleList(items, heading, cls) {
    const list = items.filter((s) => s.text.trim());
    if (!list.length) return [];
    return [{ ...sideHeading(heading), gap: 0 }, ...list.map((s, i) => ({ html: `<div class="${cls}">${esc(s.text.trim())}</div>`, gap: i === 0 ? 8.1 : 3 }))];
  }

  function customSection(c) {
    const items = c.items.filter((s) => s.text.trim());
    const hasText = lines(c.text).length > 0;
    if (c.column === 'side') {
      if (!items.length) return [];
      return simpleList(items, c.title || 'Untitled', 'sk');
    }
    if (c.kind === 'text') {
      if (!hasText) return [];
      return [mainHeading(c.title || 'Untitled', 0), ...lines(c.text).map((p, i) => ({ html: `<p class="profile-p">${esc(p)}</p>`, gap: i === 0 ? 3 : 6 }))];
    }
    if (!items.length) return [];
    return [mainHeading(c.title || 'Untitled', 0), ...items.map((s, i) => ({ html: `<div class="wb plain-wb">${esc(s.text.trim())}</div>`, gap: i === 0 ? 6 : 2 }))];
  }

  for (const col of ['side', 'main']) {
    const target = col === 'side' ? side : main;
    for (const id of cv.order[col]) {
      if (cv.hidden[id]) continue;
      const atoms = sectionBuilders[id] ? sectionBuilders[id]() : customSection(cv.custom.find((c) => c.id === id) || { items: [], text: '', column: col });
      if (!atoms.length) continue;
      const prior = target.filter((x) => !x.photo && !x.header).length;
      const cc = cv.custom.find((c) => c.id === id);
      const g = GAP[id] ?? (cc ? customGap(cc) : 24);
      atoms[0].gap = col === 'side' ? (prior ? g : (target[0] && target[0].photo ? 38.5 : 0)) : (target.length || prior ? (prior ? g : (id === 'profile' ? 42 : 34)) : 0);
      target.push(...atoms);
    }
  }
  return { side, main };
}
