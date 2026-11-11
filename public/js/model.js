/* Centralised CV data model.
   Everything the template renders comes from one plain JSON object, so it can be saved
   locally today and to a database (e.g. Supabase) later without touching the template. */

export const SCHEMA_VERSION = 1;

export const uid = () => Math.random().toString(36).slice(2, 10);

export const DEFAULT_HEADINGS = {
  contact: 'Contact',
  education: 'Education',
  skills: 'Skills',
  languages: 'Languages',
  profile: 'Profile',
  work: 'Work Experience',
  reference: 'Reference',
};

/** Which built-in sections live in which column, in default order. */
export const DEFAULT_ORDER = {
  side: ['contact', 'education', 'skills', 'languages'],
  main: ['profile', 'work', 'reference'],
};

export const SECTION_LABELS = {
  contact: 'Contact details',
  education: 'Education',
  skills: 'Skills',
  languages: 'Languages',
  profile: 'Profile / summary',
  work: 'Work experience',
  reference: 'References',
};

export function blankCV() {
  return {
    v: SCHEMA_VERSION,
    person: { firstName: '', otherNames: '', title: '', phone: '', email: '', address: '' },
    photo: null, // { src, zoom, cx, cy }
    headings: { ...DEFAULT_HEADINGS },
    labels: { refPhone: 'Phone:', refEmail: 'Email:' },
    profile: '',
    education: [],
    work: [],
    skills: [],
    languages: [],
    references: [],
    custom: [], // { id, column:'side'|'main', title, kind:'list'|'text', items:[], text:'' }
    order: { side: [...DEFAULT_ORDER.side], main: [...DEFAULT_ORDER.main] },
    hidden: {}, // { [sectionId]: true }
  };
}

/** Normalise anything loaded from storage / a backup file into a safe, complete CV object. */
export function sanitizeCV(raw) {
  const base = blankCV();
  if (!raw || typeof raw !== 'object') return base;
  const str = (x) => (typeof x === 'string' ? x : '');
  const arr = (x) => (Array.isArray(x) ? x : []);
  const cv = base;
  const p = raw.person || {};
  for (const k of Object.keys(cv.person)) cv.person[k] = str(p[k]);
  if (raw.photo && typeof raw.photo.src === 'string' && /^(data:image\/|assets\/|\/assets\/)/.test(raw.photo.src)) {
    cv.photo = {
      src: raw.photo.src,
      zoom: clampNum(raw.photo.zoom, 1, 6, 1),
      cx: clampNum(raw.photo.cx, 0, 1, 0.5),
      cy: clampNum(raw.photo.cy, 0, 1, 0.5),
    };
  }
  for (const k of Object.keys(cv.headings)) if (raw.headings && typeof raw.headings[k] === 'string') cv.headings[k] = raw.headings[k];
  if (raw.labels) for (const k of Object.keys(cv.labels)) if (typeof raw.labels[k] === 'string') cv.labels[k] = raw.labels[k];
  cv.profile = str(raw.profile);
  cv.education = arr(raw.education).map((e) => ({ id: str(e.id) || uid(), dates: str(e.dates), institution: str(e.institution), details: str(e.details) }));
  cv.work = arr(raw.work).map((w) => ({
    id: str(w.id) || uid(), organisation: str(w.organisation), role: str(w.role), dates: str(w.dates),
    responsibilities: str(w.responsibilities), achievements: str(w.achievements),
  }));
  cv.skills = arr(raw.skills).map((s) => ({ id: str(s.id) || uid(), text: str(s.text) }));
  cv.languages = arr(raw.languages).map((s) => ({ id: str(s.id) || uid(), text: str(s.text) }));
  cv.references = arr(raw.references).map((r) => ({ id: str(r.id) || uid(), name: str(r.name), organisation: str(r.organisation), phone: str(r.phone), email: str(r.email) }));
  cv.custom = arr(raw.custom).map((c) => ({
    id: str(c.id) || uid(), column: c.column === 'main' ? 'main' : 'side', title: str(c.title),
    kind: c.kind === 'text' ? 'text' : 'list',
    items: arr(c.items).map((s) => ({ id: str(s.id) || uid(), text: str(s.text) })), text: str(c.text),
  }));
  // section order: keep only known ids, then append anything missing
  const known = new Set([...DEFAULT_ORDER.side, ...DEFAULT_ORDER.main, ...cv.custom.map((c) => c.id)]);
  const colOf = (id) => (DEFAULT_ORDER.side.includes(id) ? 'side' : DEFAULT_ORDER.main.includes(id) ? 'main' : cv.custom.find((c) => c.id === id)?.column);
  const seen = new Set();
  for (const col of ['side', 'main']) {
    const out = [];
    for (const id of arr(raw.order && raw.order[col])) if (known.has(id) && !seen.has(id) && colOf(id) === col) { out.push(id); seen.add(id); }
    cv.order[col] = out;
  }
  for (const id of known) if (!seen.has(id)) cv.order[colOf(id)].push(id);
  if (raw.hidden && typeof raw.hidden === 'object') for (const id of Object.keys(raw.hidden)) if (known.has(id) && raw.hidden[id]) cv.hidden[id] = true;
  return cv;
}

function clampNum(n, lo, hi, d) {
  n = Number(n);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
}

export const lines = (s) => String(s || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
