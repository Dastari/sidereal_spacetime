/**
 * Shipyard prefab editor (route /shipyard/prefabs, deep link ?prefab=<id>). Every developer
 * prefab is ordinary grammar data: open, edit, validate, preview and publish it here, or
 * author a new one. Documents are immutable; each edit is one history step.
 */
import {
  EDGE_TYPE_IDS,
  ROOM_TYPE_IDS,
  SHAPE_TILE_IDS,
  type QuarterTurn,
} from "@sidereal/content/construction-grammar";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabStats, validateShipPrefab, type PrefabComponentCatalog, type PrefabIssue, type ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";
import {
  Box,
  ChevronLeft,
  CircleHelp,
  Copy,
  DoorOpen,
  Download,
  Eraser,
  FlipVertical2,
  Maximize,
  MousePointer2,
  PaintBucket,
  Plug,
  Redo2,
  RotateCcw,
  Save,
  Ship,
  SquareDashed,
  SunDim,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "../layout/layout.css";
import "../layout/workbench.css";
import "./prefab.css";
import {
  NEXT_FACING,
  nudgeSelection,
  reflectSelection,
  removeSelection,
  rotateSelection,
  selectionExists,
  type CommandResult,
  type PrefabSelection,
} from "./commands";
import { admissionIssue, geometriesOf, issueSelection } from "./derive";
import { DEFAULT_LAYERS, selectionCentre, type PrefabLayers } from "./hit-test";
import { Inspector } from "./Inspector";
import { SHORTCUTS, SKYLIGHT_SIZES, TOOL_BY_KEY, TOOLS, type ToolId, type ToolState } from "./keymap";
import PlanCanvas, { type PlanCanvasHandle, type PlanStatus } from "./PlanCanvas";
import { PrefabLibrary } from "./PrefabLibrary";
import type { PreviewMode } from "./PreviewPanel";
import { PublishDialog } from "./PublishDialog";
import { ShipPanel } from "./ShipPanel";
import { IssuesPanel, StatsPanel } from "./StatsPanel";
import { defaultCentreline } from "./symmetry";
import { ToolPanel } from "./ToolPanel";
import { usePrefabDocument, type PrefabStore } from "./usePrefabDocument";
import { NumberField } from "./fields";

const PreviewPanel = lazy(() => import("./PreviewPanel"));

type Doc = ShipPrefabDocumentV1;

const TOOL_ICONS: Record<ToolId, ReactNode> = {
  select: <MousePointer2 size={17} />,
  hull: <PaintBucket size={17} />,
  erase: <Eraser size={17} />,
  room: <SquareDashed size={17} />,
  edge: <DoorOpen size={17} />,
  mount: <Plug size={17} />,
  skylight: <SunDim size={17} />,
};

const LAYER_LABELS: [keyof PrefabLayers, string][] = [
  ["hull", "Hull"],
  ["rooms", "Rooms"],
  ["walls", "Walls and doors"],
  ["mounts", "Mounts"],
  ["sockets", "Sockets"],
];

const RIGHT_TABS = ["Ship", "Inspect", "Stats", "Issues"] as const;
type RightTab = (typeof RIGHT_TABS)[number];

const cycle = <T,>(list: readonly T[], value: T, step: number) => list[(list.indexOf(value) + step + list.length) % list.length];

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function initialTools(doc: Doc): ToolState {
  return {
    tool: "select",
    volume: doc.volumes.find((v) => v.kind === "hull")?.id ?? doc.volumes[0]?.id ?? "",
    shape: "square",
    rot: 0,
    reflected: false,
    roomType: "quarters",
    roomLabel: "",
    edgeType: "door.standard",
    component: null,
    mountMode: "top",
    facing: "fore",
    skylight: [2, 2],
    symmetry: false,
    centreline: defaultCentreline(doc),
  };
}

function Editor({ store, catalog, doc }: { store: PrefabStore; catalog: PrefabComponentCatalog; doc: Doc }) {
  const [tools, setToolState] = useState<ToolState>(() => initialTools(doc));
  const setTools = useCallback((patch: Partial<ToolState>) => setToolState((t) => ({ ...t, ...patch })), []);
  const [selection, setSelection] = useState<PrefabSelection | null>(null);
  const [layers, setLayers] = useState<PrefabLayers>(DEFAULT_LAYERS);
  const [tab, setTab] = useState<RightTab>("Ship");
  const [preview, setPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("flight");
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [keys, setKeys] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const plan = useRef<PlanCanvasHandle>(null);
  const file = useRef<HTMLInputElement>(null);

  const deferred = useDeferredValue(doc);
  const issues = useMemo(() => {
    const admission = admissionIssue(deferred);
    const list = validateShipPrefab(deferred, catalog);
    return admission ? [admission, ...list] : list;
  }, [deferred, catalog]);
  const stats = useMemo(() => prefabStats(deferred, catalog), [deferred, catalog]);
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;

  const storeCommit = store.commit;
  const commit = useCallback((label: string, next: Doc) => storeCommit(label, next), [storeCommit]);
  // The plan reports ghost status per snapped candidate; only re-render when it changes.
  const updateStatus = useCallback((next: PlanStatus | null) => setStatus((prev) => (prev?.text === next?.text && prev?.tone === next?.tone ? prev : next)), []);
  const select = useCallback(
    (s: PrefabSelection | null) => {
      setSelection(s);
      if (s) setTab("Inspect");
    },
    [],
  );
  const apply = useCallback(
    (label: string, r: CommandResult) => {
      if (r.doc !== doc) storeCommit(label, r.doc);
      if (r.select) select(r.select);
      if (r.error) setStatus({ text: r.error, tone: "bad" });
    },
    [doc, storeCommit, select],
  );

  // Keep selection and active volume valid across undo/redo and deletions.
  useEffect(() => {
    if (selection && !selectionExists(doc, selection)) setSelection(null);
    if (!doc.volumes.some((v) => v.id === tools.volume)) setTools({ volume: doc.volumes.find((v) => v.kind === "hull")?.id ?? doc.volumes[0]?.id ?? "" });
  }, [doc, selection, tools.volume, setTools]);

  const pickIssue = useCallback(
    (i: PrefabIssue) => {
      const s = issueSelection(i);
      if (!s) {
        setTab("Ship");
        return;
      }
      setSelection(s);
      setTab("Inspect");
      if (s.kind === "tile") setTools({ volume: s.volume });
      const c = selectionCentre(doc, catalog, geometriesOf(doc), s);
      if (c) plan.current?.focus(c);
    },
    [doc, catalog, setTools],
  );

  const setTool = useCallback(
    (tool: ToolId) => {
      setTools({ tool });
      setStatus(null);
    },
    [setTools],
  );

  const exportJson = useCallback(() => download(`${doc.id}.prefab.json`, store.exportJson()), [doc.id, store]);

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, dialog, [contenteditable='true']")) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") {
        e.preventDefault();
        return e.shiftKey ? store.redo() : store.undo();
      }
      if (mod && k === "y") {
        e.preventDefault();
        return store.redo();
      }
      if (mod && k === "s") {
        e.preventDefault();
        return store.saveNow();
      }
      if (mod || e.altKey) return;
      if (e.key === "?") return setKeys((v) => !v);
      if (e.key === "Escape") {
        if (keys) return setKeys(false);
        return setSelection(null);
      }
      if (e.key === "Home") return plan.current?.fit();
      if (e.key === "+" || e.key === "=") return plan.current?.zoom(1.25);
      if (e.key === "-") return plan.current?.zoom(0.8);
      if (TOOL_BY_KEY[k] && !e.shiftKey) return setTool(TOOL_BY_KEY[k]);
      if (k === "s") return setTools({ symmetry: !tools.symmetry });
      if (k === "r") {
        if (selection && tools.tool === "select") return apply("Rotate", rotateSelection(doc, selection));
        if (tools.tool === "hull") return setTools({ rot: ((tools.rot + (e.shiftKey ? 3 : 1)) % 4) as QuarterTurn });
        if (tools.tool === "mount") return setTools({ facing: NEXT_FACING[tools.facing] });
        if (tools.tool === "skylight") return setTools({ skylight: [tools.skylight[1], tools.skylight[0]] });
        if (selection) return apply("Rotate", rotateSelection(doc, selection));
        return;
      }
      if (k === "f") {
        if (tools.tool === "hull") return setTools({ reflected: !tools.reflected });
        if (selection) return apply("Mirror tile", reflectSelection(doc, selection));
        return;
      }
      if (e.key === "[" || e.key === "]") {
        const step = e.key === "]" ? 1 : -1;
        if (tools.tool === "hull") return setTools({ shape: cycle(SHAPE_TILE_IDS, tools.shape, step) });
        if (tools.tool === "edge") return setTools({ edgeType: cycle(EDGE_TYPE_IDS, tools.edgeType, step) });
        if (tools.tool === "room") return setTools({ roomType: cycle(ROOM_TYPE_IDS, tools.roomType, step), roomLabel: "" });
        if (tools.tool === "skylight") return setTools({ skylight: cycle(SKYLIGHT_SIZES, SKYLIGHT_SIZES.find((s) => s.join() === tools.skylight.join()) ?? SKYLIGHT_SIZES[0], step) });
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selection) {
        e.preventDefault();
        commit(`Delete ${selection.kind}`, removeSelection(doc, selection));
        return setSelection(null);
      }
      if (e.key.startsWith("Arrow") && selection) {
        e.preventDefault();
        const unit = (selection.kind === "mount" ? 0.5 : 1) * (e.shiftKey ? (selection.kind === "mount" ? 10 : 5) : 1);
        const d: [number, number] = e.key === "ArrowLeft" ? [-unit, 0] : e.key === "ArrowRight" ? [unit, 0] : e.key === "ArrowUp" ? [0, unit] : [0, -unit];
        return apply(`Nudge ${selection.kind}`, nudgeSelection(doc, selection, d[0], d[1]));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc, selection, tools, keys, store, apply, commit, setTool, setTools]);

  const save = store.saveState === "saved" ? `Draft saved ${store.savedAt ? new Date(store.savedAt).toLocaleTimeString() : ""}` : store.saveState === "pending" ? "Saving draft" : store.saveState === "error" ? "Draft not saved" : "Template, unmodified";
  const undoLabel = store.history?.past[store.history.past.length - 1]?.label;
  const redoLabel = store.history?.future[0]?.label;

  return (
    <main className="layout-editor prefab-editor" data-preview={preview} data-tool={tools.tool}>
      <header className="layout-document-bar pf-docbar">
        <button className="pf-back" onClick={store.close} aria-label="Back to prefab library" title="Prefab library">
          <ChevronLeft size={16} /> Library
        </button>
        <Ship className="document-symbol" size={22} />
        <div className="pf-title">
          <h1>{doc.name}</h1>
          <span>
            {doc.id}, size {doc.sizeClass}, revision {doc.revision}
          </span>
        </div>
        <span className="layout-save-status" role="status" data-state={store.saveState}>
          <i />
          {save}
        </span>
        <div className="layout-document-actions">
          <button aria-label="Undo" title={undoLabel ? `Undo ${undoLabel} (Ctrl+Z)` : "Undo (Ctrl+Z)"} disabled={!store.history?.past.length} onClick={store.undo}>
            <Undo2 size={16} />
            <span>Undo</span>
          </button>
          <button aria-label="Redo" title={redoLabel ? `Redo ${redoLabel} (Ctrl+Shift+Z)` : "Redo (Ctrl+Shift+Z)"} disabled={!store.history?.future.length} onClick={store.redo}>
            <Redo2 size={16} />
            <span>Redo</span>
          </button>
          <button onClick={store.saveNow} title="Save draft now (Ctrl+S)">
            <Save size={16} /> Save
          </button>
          <details className="layout-file-menu">
            <summary>File</summary>
            <div>
              <button onClick={() => store.duplicate()}>
                <Copy size={16} /> Duplicate as new draft
              </button>
              <button onClick={() => file.current?.click()}>
                <Upload size={16} /> Import JSON
              </button>
              <button onClick={exportJson}>
                <Download size={16} /> Export JSON
              </button>
              {store.isTemplate && (
                <button onClick={store.revertToTemplate}>
                  <RotateCcw size={16} /> Revert to template
                </button>
              )}
              {store.hasDraft && (
                <button
                  onClick={() => {
                    if (confirm(store.isTemplate ? "Discard this local draft and reopen the template?" : "Delete this draft? This cannot be undone.")) store.deleteDraft(doc.id);
                  }}
                >
                  <Trash2 size={16} /> {store.isTemplate ? "Discard local draft" : "Delete draft"}
                </button>
              )}
            </div>
          </details>
          <button className="layout-primary" onClick={() => setPublishing(true)}>
            Publish blueprint
          </button>
        </div>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const msg = store.importJson(await f.text());
            if (msg) store.setError(msg);
          }}
        />
      </header>
      {store.error && (
        <div className="layout-alert" role="alert">
          <span>{store.error}</span>
          <button onClick={() => store.setError("")}>Dismiss</button>
        </div>
      )}
      <div className="pf-toolbar" role="toolbar" aria-label="Plan tools">
        <div className="pf-tools">
          {TOOLS.map((t) => (
            <button key={t.id} aria-pressed={tools.tool === t.id} title={`${t.label} (${t.key})`} aria-label={t.label} onClick={() => setTool(t.id)} data-tool-button={t.id}>
              {TOOL_ICONS[t.id]}
              <span>{t.label}</span>
              <kbd>{t.key}</kbd>
            </button>
          ))}
        </div>
        <span className="pf-divider" />
        <button aria-pressed={tools.symmetry} title="Port/starboard symmetry (S)" onClick={() => setTools({ symmetry: !tools.symmetry })} data-symmetry>
          <FlipVertical2 size={16} /> Symmetry
        </button>
        {tools.symmetry && (
          <div className="pf-centreline">
            <NumberField label="Centreline y" unit="m" step={0.5} value={tools.centreline} onCommit={(centreline) => setTools({ centreline })} />
          </div>
        )}
        <span className="pf-divider" />
        <div className="pf-layers" role="group" aria-label="Layers">
          {LAYER_LABELS.map(([k, label]) => (
            <button key={k} aria-pressed={layers[k]} onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))}>
              {label}
            </button>
          ))}
        </div>
        <span className="pf-spacer" />
        <button aria-label="Zoom out" title="Zoom out (-)" onClick={() => plan.current?.zoom(0.8)}>
          <ZoomOut size={16} />
        </button>
        <button aria-label="Zoom in" title="Zoom in (+)" onClick={() => plan.current?.zoom(1.25)}>
          <ZoomIn size={16} />
        </button>
        <button aria-label="Fit ship" title="Fit ship (Home)" onClick={() => plan.current?.fit()}>
          <Maximize size={16} />
        </button>
        <button aria-pressed={preview} onClick={() => setPreview((v) => !v)} title="3D preview" data-preview-toggle>
          <Box size={16} /> 3D preview
        </button>
        <button aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" aria-pressed={keys} onClick={() => setKeys((v) => !v)}>
          <CircleHelp size={16} />
        </button>
      </div>
      <div className="pf-workspace">
        <ToolPanel doc={doc} catalog={catalog} tools={tools} setTools={setTools} commit={commit} />
        <section className="pf-center">
          <PlanCanvas
            doc={doc}
            catalog={catalog}
            tools={tools}
            selection={selection}
            select={select}
            layers={layers}
            commit={commit}
            onStatus={updateStatus}
            handle={plan}
          />
          {preview && (
            <Suspense fallback={<section className="prefab-preview"><p className="prefab-preview-status">Loading the 3D preview</p></section>}>
              <PreviewPanel doc={doc} catalog={catalog} mode={previewMode} onMode={setPreviewMode} />
            </Suspense>
          )}
          {keys && (
            <div className="pf-keys" role="dialog" aria-label="Keyboard shortcuts">
              <header>
                <h2>Keyboard shortcuts</h2>
                <button onClick={() => setKeys(false)}>Close</button>
              </header>
              <dl>
                {SHORTCUTS.map((s) => (
                  <div key={s.keys}>
                    <dt>
                      <kbd>{s.keys}</kbd>
                    </dt>
                    <dd>{s.action}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </section>
        <aside className="layout-right pf-right" aria-label="Ship details">
          <div className="layout-tabs" role="tablist" aria-label="Details">
            {RIGHT_TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {t}
                {t === "Issues" && issues.length > 0 && <b className={errors ? "bad" : "warn"}>{issues.length}</b>}
              </button>
            ))}
          </div>
          {tab === "Ship" && <ShipPanel doc={doc} commit={commit} changeId={store.changeId} />}
          {tab === "Inspect" && <Inspector doc={doc} catalog={catalog} selection={selection} select={setSelection} commit={commit} apply={apply} issues={issues} />}
          {tab === "Stats" && <StatsPanel doc={doc} stats={stats} />}
          {tab === "Issues" && <IssuesPanel issues={issues} onPick={pickIssue} />}
        </aside>
      </div>
      <footer className="layout-statusbar pf-statusbar">
        <span className="pf-cursor">Plan: fore right, port up</span>
        <span className="pf-status" data-tone={status?.tone ?? "info"} role="status">
          {status?.text ?? TOOLS.find((t) => t.id === tools.tool)?.hint}
        </span>
        <span>
          {doc.volumes.length} volumes, {doc.volumes.reduce((n, v) => n + v.tiles.length, 0)} tiles, {doc.rooms.length} rooms, {doc.edges.length} edges, {doc.mounts.length} mounts
        </span>
        <button onClick={() => setTab("Issues")} data-tone={errors ? "bad" : warnings ? "warn" : "good"} className="pf-issue-count">
          {errors} errors, {warnings} warnings
        </button>
      </footer>
      {publishing && (
        <PublishDialog doc={doc} catalog={catalog} commit={commit} onClose={() => setPublishing(false)} onPickIssue={pickIssue} onExport={exportJson} />
      )}
    </main>
  );
}

export default function PrefabShipyard() {
  const store = usePrefabDocument();
  const catalog = useMemo(() => defaultPrefabComponentCatalog(), []);
  if (!store.doc) return <PrefabLibrary store={store} catalog={catalog} />;
  return <Editor key={store.doc.id} store={store} catalog={catalog} doc={store.doc} />;
}
