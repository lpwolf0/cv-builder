/* Single source of truth for the CV being edited, plus local-only persistence.
   Nothing here talks to a network. To add account-based saving later (e.g. Supabase), implement the
   same two functions (load / save) against a remote table and swap them in `createStore({ storage })`. */
import { sanitizeCV, blankCV } from './model.js';

const KEY = 'cvbuilder.cv.v1';

export const localStorageAdapter = {
  load() { try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } },
  save(cv) { try { localStorage.setItem(KEY, JSON.stringify(cv)); return true; } catch { return false; } },
  clear() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } },
};

export function createStore(storage = localStorageAdapter) {
  const saved = storage.load();
  let cv = saved ? sanitizeCV(saved) : blankCV();
  const hadSaved = !!saved;
  const subs = new Set();
  const statusSubs = new Set();
  let timer = null;
  let status = { state: hadSaved ? 'saved' : 'idle', at: hadSaved ? Date.now() : null };

  const setStatus = (s) => { status = s; statusSubs.forEach((f) => f(status)); };
  const emit = () => subs.forEach((f) => f(cv));

  function saveNow() {
    clearTimeout(timer); timer = null;
    const ok = storage.save(cv);
    setStatus(ok ? { state: 'saved', at: Date.now() } : { state: 'error', at: null });
    return ok;
  }

  return {
    hadSaved,
    get cv() { return cv; },
    get status() { return status; },
    /** Mutate the CV in place via `fn(cv)`, then notify the preview and schedule an autosave. */
    update(fn) {
      fn(cv); emit();
      setStatus({ state: 'saving', at: null });
      clearTimeout(timer); timer = setTimeout(saveNow, 400);
    },
    /** Replace the whole CV (reset, import, example). */
    replace(next) { cv = sanitizeCV(next); emit(); saveNow(); },
    saveNow,
    clearSaved() { storage.clear(); },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
    onStatus(f) { statusSubs.add(f); return () => statusSubs.delete(f); },
  };
}
