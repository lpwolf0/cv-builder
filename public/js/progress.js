/* Which parts of the CV have content. Drives the progress bar and the tick marks in the editor. */
const has = (s) => !!String(s || '').trim();

export function completion(cv) {
  const p = cv.person;
  return {
    personal: has(p.firstName) || has(p.otherNames),
    title: has(p.title),
    contact: has(p.phone) || has(p.email) || has(p.address),
    photo: !!cv.photo,
    profile: has(cv.profile),
    education: cv.education.some((e) => has(e.institution) || has(e.dates) || has(e.details)),
    work: cv.work.some((w) => has(w.organisation) || has(w.role) || has(w.responsibilities)),
    skills: cv.skills.some((s) => has(s.text)),
    languages: cv.languages.some((s) => has(s.text)),
    references: cv.references.some((r) => has(r.name) || has(r.email) || has(r.phone)),
  };
}

export function progress(cv) {
  const c = completion(cv);
  const keys = Object.keys(c);
  const done = keys.filter((k) => c[k]).length;
  return { done, total: keys.length, pct: Math.round((done / keys.length) * 100), c };
}
