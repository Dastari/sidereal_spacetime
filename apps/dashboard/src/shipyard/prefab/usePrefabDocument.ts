/**
 * Prefab document store: developer templates (PREFAB_SHIPS) plus browser drafts in
 * localStorage, an immutable command history and autosave. Drafts never overwrite
 * templates; "revert to template" is itself an undoable command.
 */
import { PREFAB_SHIPS, prefabById } from "@sidereal/content/prefabs";
import {
  SHIP_PREFAB_LIMITS,
  blankShipPrefab,
  parseShipPrefabJson,
  readShipPrefab,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import type { BlueprintSizeClassId } from "@sidereal/content/construction-grammar";
import type { ShipThemeId } from "@sidereal/content/ship-prefab";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyCommand, createHistory, redo as redoHistory, undo as undoHistory, type History } from "./history";

type Doc = ShipPrefabDocumentV1;

export const DRAFT_PREFIX = "sidereal.prefab.draft.v1:";
const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/;

export interface DraftRecord {
  schema: "sidereal.prefab-draft.v1";
  savedAt: string;
  doc: Doc;
}

export interface LibraryEntry {
  id: string;
  doc: Doc;
  template: Doc | null;
  draft: { savedAt: string; doc: Doc } | null;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Minimal structural check for drafts that are mid-edit and not yet admissible. */
function looksLikePrefab(v: unknown): v is Doc {
  const d = v as Doc;
  return (
    !!d && typeof d === "object" && typeof d.id === "string" && Array.isArray(d.volumes) && Array.isArray(d.rooms) &&
    Array.isArray(d.edges) && Array.isArray(d.mounts) && Array.isArray(d.skylights) && !!d.markings
  );
}

export function readDraftRecord(raw: string | null): DraftRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as DraftRecord;
    if (r?.schema !== "sidereal.prefab-draft.v1" || !looksLikePrefab(r.doc)) return null;
    let doc: Doc = r.doc;
    try {
      doc = readShipPrefab(r.doc);
    } catch {
      /* Keep the saved bytes; validation reports what is inadmissible. */
    }
    return { schema: r.schema, savedAt: String(r.savedAt ?? ""), doc };
  } catch {
    return null;
  }
}

export function listDrafts(): DraftRecord[] {
  const s = storage();
  if (!s) return [];
  const out: DraftRecord[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (!k?.startsWith(DRAFT_PREFIX)) continue;
    const r = readDraftRecord(s.getItem(k));
    if (r) out.push(r);
  }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function writeDraft(doc: Doc): string {
  const savedAt = new Date().toISOString();
  const record: DraftRecord = { schema: "sidereal.prefab-draft.v1", savedAt, doc };
  const json = JSON.stringify(record);
  if (json.length > SHIP_PREFAB_LIMITS.bytes * 2) throw Error("Draft exceeds the prefab size limit");
  storage()?.setItem(DRAFT_PREFIX + doc.id, json);
  return savedAt;
}

export function deleteDraftRecord(id: string) {
  storage()?.removeItem(DRAFT_PREFIX + id);
}

export function buildLibrary(drafts: readonly DraftRecord[]): LibraryEntry[] {
  const out: LibraryEntry[] = PREFAB_SHIPS.map((t) => {
    const d = drafts.find((x) => x.doc.id === t.id);
    return { id: t.id, doc: d?.doc ?? t, template: t, draft: d ? { savedAt: d.savedAt, doc: d.doc } : null };
  });
  for (const d of drafts) if (!prefabById(d.doc.id)) out.push({ id: d.doc.id, doc: d.doc, template: null, draft: { savedAt: d.savedAt, doc: d.doc } });
  return out;
}

export type SaveState = "template" | "pending" | "saved" | "error";

function readQuery(): string | null {
  return new URLSearchParams(location.search).get("prefab");
}

function writeQuery(id: string | null, push: boolean) {
  const url = new URL(location.href);
  if (id) url.searchParams.set("prefab", id);
  else url.searchParams.delete("prefab");
  if (url.href === location.href) return;
  if (push) history.pushState({}, "", url);
  else history.replaceState({}, "", url);
}

export function usePrefabDocument() {
  const [drafts, setDrafts] = useState<DraftRecord[]>(() => listDrafts());
  const [hist, setHist] = useState<History<Doc> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("template");
  const [savedAt, setSavedAt] = useState<string>("");
  const [error, setError] = useState("");
  /** Document as loaded (template or draft); autosave starts after the first change. */
  const loaded = useRef<Doc | null>(null);
  const library = useMemo(() => buildLibrary(drafts), [drafts]);
  const refresh = useCallback(() => setDrafts(listDrafts()), []);

  const openDoc = useCallback((doc: Doc, options: { push?: boolean; draftSavedAt?: string } = {}) => {
    loaded.current = doc;
    setHist(createHistory(doc));
    setSaveState(options.draftSavedAt ? "saved" : "template");
    setSavedAt(options.draftSavedAt ?? "");
    setError("");
    writeQuery(doc.id, options.push ?? true);
  }, []);

  const open = useCallback(
    (id: string, push = true) => {
      const draft = listDrafts().find((d) => d.doc.id === id);
      const template = prefabById(id);
      if (draft) openDoc(draft.doc, { push, draftSavedAt: draft.savedAt });
      else if (template) openDoc(structuredClone(template) as Doc, { push });
      else {
        setError(`No prefab or draft named ${id}`);
        return false;
      }
      return true;
    },
    [openDoc],
  );

  const close = useCallback(() => {
    setHist(null);
    loaded.current = null;
    refresh();
    writeQuery(null, true);
  }, [refresh]);

  // Deep link and back/forward navigation.
  useEffect(() => {
    const sync = () => {
      const id = readQuery();
      if (!id) {
        setHist(null);
        loaded.current = null;
        refresh();
      } else if (id !== loaded.current?.id) open(id, false);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = useCallback((label: string, next: Doc | ((doc: Doc) => Doc)) => {
    setHist((h) => (h ? applyCommand(h, label, typeof next === "function" ? next(h.present) : next) : h));
  }, []);
  const undo = useCallback(() => setHist((h) => (h ? undoHistory(h) : h)), []);
  const redo = useCallback(() => setHist((h) => (h ? redoHistory(h) : h)), []);

  const doc = hist?.present ?? null;

  const saveNow = useCallback(
    (d: Doc | null = doc) => {
      if (!d) return;
      try {
        setSavedAt(writeDraft(d));
        setSaveState("saved");
        setError("");
      } catch (e) {
        setSaveState("error");
        setError(`Draft not saved: ${String(e instanceof Error ? e.message : e)}`);
      }
    },
    [doc],
  );

  // Autosave once the document differs from what was opened.
  useEffect(() => {
    if (!doc || doc === loaded.current) return;
    setSaveState("pending");
    const t = window.setTimeout(() => {
      saveNow(doc);
      refresh();
    }, 400);
    return () => window.clearTimeout(t);
  }, [doc, saveNow, refresh]);

  const idTaken = useCallback((id: string) => !!prefabById(id) || listDrafts().some((d) => d.doc.id === id), []);

  const create = useCallback(
    (input: { id: string; name: string; sizeClass: BlueprintSizeClassId; theme: ShipThemeId }) => {
      if (!ID.test(input.id)) return "Use lower-case letters, digits, dots and dashes for the id";
      if (idTaken(input.id)) return `${input.id} is already in the library`;
      const doc = blankShipPrefab(input.id, input.name, input.sizeClass, input.theme);
      try {
        readShipPrefab(doc);
      } catch (e) {
        return String(e instanceof Error ? e.message : e);
      }
      openDoc(doc);
      saveNow(doc);
      refresh();
      return null;
    },
    [idTaken, openDoc, saveNow, refresh],
  );

  const freeId = useCallback(
    (base: string) => {
      const stem = base.replace(/(-copy(-\d+)?)?$/, "");
      for (let i = 1; ; i++) {
        const id = `${stem}-copy${i === 1 ? "" : `-${i}`}`.slice(0, 80);
        if (!idTaken(id)) return id;
      }
    },
    [idTaken],
  );

  const duplicate = useCallback(
    (source: Doc | null = doc) => {
      if (!source) return;
      const id = freeId(source.id);
      const name = `${source.name} copy`.slice(0, 32);
      const next: Doc = { ...structuredClone(source), id, name, revision: 1 };
      openDoc(next);
      saveNow(next);
      refresh();
    },
    [doc, freeId, openDoc, saveNow, refresh],
  );

  /** Change the document id: the draft moves to the new key (templates are never touched). */
  const changeId = useCallback(
    (id: string) => {
      if (!doc) return "No document";
      if (!ID.test(id)) return "Use lower-case letters, digits, dots and dashes for the id";
      if (id !== doc.id && idTaken(id)) return `${id} is already in the library`;
      const previous = doc.id;
      const next = { ...doc, id };
      setHist((h) => (h ? applyCommand(h, "Change id", next) : h));
      if (!prefabById(previous)) deleteDraftRecord(previous);
      saveNow(next);
      loaded.current = null;
      writeQuery(id, false);
      refresh();
      return null;
    },
    [doc, idTaken, saveNow, refresh],
  );

  const deleteDraft = useCallback(
    (id: string) => {
      deleteDraftRecord(id);
      refresh();
      if (doc?.id === id) {
        const template = prefabById(id);
        if (template) openDoc(structuredClone(template) as Doc, { push: false });
        else close();
      }
    },
    [doc, openDoc, close, refresh],
  );

  const revertToTemplate = useCallback(() => {
    if (!doc) return;
    const template = prefabById(doc.id);
    if (template) commit("Revert to template", structuredClone(template) as Doc);
  }, [doc, commit]);

  const importJson = useCallback(
    (text: string): string | null => {
      let parsed: Doc;
      try {
        parsed = parseShipPrefabJson(text);
      } catch (e) {
        return `Import refused: ${String(e instanceof Error ? e.message : e)}`;
      }
      const next = idTaken(parsed.id) ? { ...parsed, id: freeId(parsed.id) } : parsed;
      openDoc(next);
      saveNow(next);
      refresh();
      return next.id === parsed.id ? null : `Imported as ${next.id}; ${parsed.id} is already in the library`;
    },
    [idTaken, freeId, openDoc, saveNow, refresh],
  );

  const exportJson = useCallback(() => (doc ? `${JSON.stringify(doc, null, 2)}\n` : ""), [doc]);

  return {
    library,
    doc,
    history: hist,
    open,
    openDoc,
    close,
    commit,
    undo,
    redo,
    create,
    duplicate,
    changeId,
    deleteDraft,
    revertToTemplate,
    importJson,
    exportJson,
    saveNow: () => {
      saveNow();
      refresh();
    },
    saveState,
    savedAt,
    error,
    setError,
    isTemplate: !!(doc && prefabById(doc.id)),
    hasDraft: !!(doc && drafts.some((d) => d.doc.id === doc.id)),
  };
}

export type PrefabStore = ReturnType<typeof usePrefabDocument>;
