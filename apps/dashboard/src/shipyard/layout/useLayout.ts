import {
  createWayfarerTemplateDraft,
  preserveBeforeTemplate,
} from "./wayfarer-template";
import { useEffect, useRef, useState } from "react";
import {
  emptyLayout,
  withRequiredShapeDependency,
  layoutFixture,
  migrateAssembly,
  type LayoutDocument,
} from "../../../../../packages/content/src/ship-layout";
import { readLayout } from "../../../../../packages/sim/src/layout-validation";
import type { CompiledLayout } from "../../../../../packages/sim/src/layout-compiler";
import {
  DEFAULT_VIEW,
  push,
  undo,
  redo,
  readCheckpoint,
  recoveryKey,
  writeCheckpoint,
  type History,
  type ViewState,
  type Checkpoint,
} from "./state";
export function uuid() {
  return (
    crypto.randomUUID?.() ??
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
      return (c === "x" ? r : (r & 3) | 8).toString(16);
    })
  );
}
export function download(value: string, name: string) {
  const url = URL.createObjectURL(
      new Blob([value], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
function boot() {
  let identity = "local-unavailable",
    raw: string | null = null;
  try {
    identity =
      localStorage.getItem("sidereal.layout.local-profile.v1") ?? uuid();
    localStorage.setItem("sidereal.layout.local-profile.v1", identity);
    const key = localStorage.getItem(`sidereal.layout.active.v1:${identity}`);
    raw = key ? localStorage.getItem(key) : null;
    if (key && !raw)
      throw new Error(
        "The selected recovery document is missing. Choose an explicit new draft or import your export.",
      );
    if (raw) {
      const saved = readCheckpoint(raw);
      if (key !== recoveryKey(identity, saved.history.present))
        throw new Error("Recovery identity/document scope mismatch");
      return {
        identity,
        raw,
        history: saved.history,
        view: saved.view,
        sequence: saved.sequence,
        recovery:
          localStorage.getItem(
            `sidereal.layout.pending-import.v1:${identity}`,
          ) ?? "",
        error: localStorage.getItem(
          `sidereal.layout.pending-import.v1:${identity}`,
        )
          ? "Unsupported import preserved. Export it or resume the saved draft."
          : "",
      };
    }
    const doc = layoutFixture();
    doc.id = uuid();
    return {
      identity,
      raw: null,
      history: { past: [], present: doc, future: [] } as History,
      view: DEFAULT_VIEW,
      sequence: 0,
      recovery: "",
      error: "",
    };
  } catch (e) {
    return {
      identity,
      raw,
      history: null,
      view: DEFAULT_VIEW,
      sequence: 0,
      recovery: raw ?? "",
      error: String(e),
    };
  }
}
export function useLayout() {
  const [initial] = useState(boot),
    [history, setHistory] = useState<History | null>(initial.history),
    [view, setView] = useState<ViewState>(initial.view),
    [error, setError] = useState(initial.error),
    [recovery, setRecovery] = useState(initial.recovery),
    [conflict, setConflict] = useState(false),
    [saved, setSaved] = useState("Local draft"),
    [result, setResult] = useState<CompiledLayout>(),
    [milliseconds, setMilliseconds] = useState(0),
    [busy, setBusy] = useState(false);
  const [legacy, setLegacy] = useState(() => {
    try {
      return localStorage.getItem("sidereal.assembly.draft.v1");
    } catch {
      return null;
    }
  });
  const expected = useRef(initial.raw),
    sequence = useRef(initial.sequence),
    writer = useRef(uuid()),
    worker = useRef<Worker | null>(null),
    serial = useRef(0),
    latest = useRef({ history, view });
  latest.current = { history, view };
  const doc = history?.present ?? null,
    blocked = !!recovery || conflict || !doc;
  const save = () => {
    const { history, view } = latest.current;
    if (!history || recovery || conflict) return;
    try {
      const key = recoveryKey(initial.identity, history.present),
        c: Checkpoint = {
          schema: "sidereal.layout-recovery.v1",
          sequence: sequence.current + 1,
          writer: writer.current,
          history,
          view,
        };
      expected.current = writeCheckpoint(
        localStorage,
        key,
        expected.current,
        c,
      );
      sequence.current = c.sequence;
      localStorage.setItem(
        `sidereal.layout.active.v1:${initial.identity}`,
        key,
      );
      setSaved("Saved locally");
    } catch (e) {
      setError(String(e));
      setSaved("Not saved · export to keep changes");
      if (String(e).includes("Another editor")) setConflict(true);
    }
  };
  useEffect(() => {
    const w = new Worker(new URL("./compiler.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = (e) => {
      if (e.data.serial !== serial.current) return;
      setBusy(false);
      if (e.data.error) setError(e.data.error);
      else {
        setResult(e.data.result);
        setMilliseconds(e.data.milliseconds);
      }
    };
    w.onerror = () => {
      setBusy(false);
      setError("Compiler worker failed. Your draft remains exportable.");
    };
    return () => {
      worker.current = null;
      w.terminate();
    };
  }, []);
  useEffect(() => {
    if (doc && !doc.decks.some((d) => d.id === view.deckId)) {
      setView((v) => ({ ...v, deckId: doc.decks[0].id }));
    }
  }, [doc, view.deckId]);
  useEffect(() => {
    if (doc && worker.current) {
      setBusy(true);
      worker.current.postMessage({ serial: ++serial.current, document: doc });
    }
  }, [doc]);
  useEffect(() => {
    if (!history || blocked) return;
    save();
  }, [history, view, blocked]);
  useEffect(() => {
    const changed = (e: StorageEvent) => {
      const h = latest.current.history;
      if (
        h &&
        e.key === recoveryKey(initial.identity, h.present) &&
        e.newValue !== expected.current
      ) {
        setConflict(true);
        setError(
          "Another editor changed this draft. Your proposal remains in memory. Export or fork it.",
        );
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  function commit(change: (d: LayoutDocument) => LayoutDocument) {
    if (blocked || !history) return;
    try {
      const next = push(
        history,
        withRequiredShapeDependency(change(structuredClone(history.present))),
      );
      setHistory(next);
      setError("");
      setSaved("Saving locally…");
    } catch (e) {
      setError(String(e));
    }
  }
  function adopt(
    d: LayoutDocument,
    copy = false,
    preserveView = false,
    replaceExisting = false,
  ) {
    try {
      if (copy) d = { ...d, id: uuid() };
      readLayout(d);
      setRecovery("");
      localStorage.removeItem(
        `sidereal.layout.pending-import.v1:${initial.identity}`,
      );
      setConflict(false);
      // Explicit remote Load may replace this local recovery revision. Preserve CAS
      // against any write after this read; ordinary imports still fork by default.
      const existing = replaceExisting
        ? localStorage.getItem(recoveryKey(initial.identity, d))
        : null;
      expected.current = existing;
      sequence.current = existing ? readCheckpoint(existing).sequence : 0;
      setHistory({ past: [], present: d, future: [] });
      setView((v) => ({
        ...(preserveView ? v : DEFAULT_VIEW),
        deckId: d.decks[0].id,
      }));
      setError("");
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }
  return {
    adopt,
    adoptServer: (d: LayoutDocument) => adopt(d, false, false, true),
    doc,
    history,
    view,
    setView,
    error,
    setError,
    recovery,
    conflict,
    blocked,
    saved,
    result,
    milliseconds,
    busy,
    legacy,
    commit,
    save,
    undo: () => {
      if (!blocked && history) setHistory(undo(history));
    },
    redo: () => {
      if (!blocked && history) setHistory(redo(history));
    },
    exportDraft: () =>
      download(
        recovery ||
          (history
            ? JSON.stringify(
                {
                  schema: "sidereal.layout-recovery.v1",
                  sequence: sequence.current,
                  writer: writer.current,
                  history,
                  view,
                },
                null,
                2,
              )
            : (initial.raw ?? "null")),
        recovery ? "preserved-layout.json" : `${doc?.name ?? "layout"}.json`,
      ),
    exportLegacy: () => {
      if (legacy) download(legacy, "preserved-assembly-v1.json");
    },
    migrate: () => {
      if (legacy) {
        try {
          adopt(migrateAssembly(legacy, uuid(), uuid()));
        } catch (e) {
          setError(String(e));
        }
      }
    },
    fork: () => {
      if (doc) adopt(doc, true);
    },
    resume: () => {
      localStorage.removeItem(
        `sidereal.layout.pending-import.v1:${initial.identity}`,
      );
      setRecovery("");
      setError("");
    },
    savedDrafts: () => {
      const rows: { key: string; name: string }[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        if (
          !key.startsWith(
            `sidereal.layout.recovery.v1:${encodeURIComponent(initial.identity)}:`,
          )
        )
          continue;
        try {
          const c = readCheckpoint(localStorage.getItem(key)!);
          rows.push({ key, name: c.history.present.name });
        } catch {
          rows.push({ key, name: "Unsupported saved draft · recovery" });
        }
      }
      return rows;
    },
    openSaved: (key: string) => {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      try {
        const c = readCheckpoint(raw);
        if (key !== recoveryKey(initial.identity, c.history.present))
          throw new Error("Wrong recovery scope");
        expected.current = raw;
        sequence.current = c.sequence;
        setRecovery("");
        setConflict(false);
        setError("");
        setHistory(c.history);
        setView(c.view);
      } catch (e) {
        setError(String(e));
        setRecovery(raw);
      }
    },
    createFromWayfarer: (template: unknown) => {
      try {
        if (!latest.current.history)
          throw Error(
            "Keep or export the current recovery document before loading a template",
          );
        const next = createWayfarerTemplateDraft(template, uuid());
        if (localStorage.getItem(recoveryKey(initial.identity, next)) !== null)
          throw Error("The new draft identity is already in use");
        const checkpoint: Checkpoint = {
          schema: "sidereal.layout-recovery.v1",
          sequence: sequence.current + 1,
          writer: writer.current,
          history: latest.current.history,
          view: latest.current.view,
        };
        expected.current = preserveBeforeTemplate(
          localStorage,
          initial.identity,
          expected.current,
          checkpoint,
          blocked,
        );
        sequence.current = checkpoint.sequence;
        return adopt(next);
      } catch (e) {
        setError(String(e));
        return false;
      }
    },
    create: (kind: LayoutDocument["kind"], sample = false) => {
      const d = sample ? layoutFixture() : emptyLayout(uuid(), uuid(), kind);
      if (sample) d.id = uuid();
      adopt(d);
    },
    importFile: async (file: File) => {
      if (file.size > 12 * 1024 * 1024) {
        setError(
          "Import exceeds the 12 MiB recovery limit; existing draft unchanged.",
        );
        return;
      }
      const raw = await file.text();
      try {
        const parsed = JSON.parse(raw);
        if (parsed.schema === "sidereal.layout-recovery.v1") {
          const c = readCheckpoint(raw);
          const newId = uuid();
          c.history.present.id = newId;
          c.history.past.forEach((d) => (d.id = newId));
          c.history.future.forEach((d) => (d.id = newId));
          expected.current = null;
          sequence.current = 0;
          setRecovery("");
          localStorage.removeItem(
            `sidereal.layout.pending-import.v1:${initial.identity}`,
          );
          setConflict(false);
          setHistory(c.history);
          setView(c.view);
          setError(
            "Imported a separate draft with its original history and source revision.",
          );
        } else if (
          (parsed.present ?? parsed).schema === "sidereal.assembly-draft.v1"
        )
          adopt(migrateAssembly(raw, uuid(), uuid()));
        else adopt(readLayout(parsed), true);
      } catch (e) {
        setError(
          `${String(e)}. Import remains available for export; current draft was not replaced.`,
        );
        setRecovery(raw);
        try {
          localStorage.setItem(
            `sidereal.layout.quarantine.v1:${initial.identity}:${uuid()}`,
            raw,
          );
          localStorage.setItem(
            `sidereal.layout.pending-import.v1:${initial.identity}`,
            raw,
          );
        } catch {
          setError(
            "Unsupported import is retained in memory. Browser storage is full; export before refresh.",
          );
        }
      }
    },
  };
}
