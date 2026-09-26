/**
 * Command history for the prefab editor. Every edit is one immutable document
 * transition; the history keeps the documents themselves (prefab documents are small),
 * so undo and redo never replay or re-derive anything.
 */
export const HISTORY_LIMIT = 200;

export interface HistoryEntry<T> {
  doc: T;
  /** Label of the command that left this document (shown as "Undo <label>"). */
  label: string;
}

export interface History<T> {
  past: HistoryEntry<T>[];
  present: T;
  future: HistoryEntry<T>[];
}

export function createHistory<T>(doc: T): History<T> {
  return { past: [], present: doc, future: [] };
}

/** Apply one command. A command that returns the same document records nothing. */
export function applyCommand<T>(h: History<T>, label: string, next: T, limit = HISTORY_LIMIT): History<T> {
  if (next === h.present) return h;
  const past = [...h.past, { doc: h.present, label }];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, present: next, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  const last = h.past[h.past.length - 1];
  if (!last) return h;
  return { past: h.past.slice(0, -1), present: last.doc, future: [{ doc: h.present, label: last.label }, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  const next = h.future[0];
  if (!next) return h;
  return { past: [...h.past, { doc: h.present, label: next.label }], present: next.doc, future: h.future.slice(1) };
}

export const undoLabel = <T>(h: History<T>) => h.past[h.past.length - 1]?.label ?? null;
export const redoLabel = <T>(h: History<T>) => h.future[0]?.label ?? null;
