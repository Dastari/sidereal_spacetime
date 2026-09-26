/** Prefab library: developer templates and browser drafts, plus new-ship and import. */
import { BLUEPRINT_SIZE_CLASS_IDS, G, type BlueprintSizeClassId } from "@sidereal/content/construction-grammar";
import { SHIP_THEME_IDS, prefabBounds, type PrefabComponentCatalog, type ShipPrefabDocumentV1, type ShipThemeId } from "@sidereal/content/ship-prefab";
import { SHIP_THEMES } from "@sidereal/content/ship-themes";
import { Copy, FileUp, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { prefabBlueprintSvg } from "../../../../../packages/render/src/prefab-ship/blueprint-svg";
import { geometriesOf } from "./derive";
import { ThemeSwatches } from "./ShipPanel";
import type { LibraryEntry, PrefabStore } from "./usePrefabDocument";

type Doc = ShipPrefabDocumentV1;

const thumbCache = new WeakMap<Doc, string>();
function thumbnail(doc: Doc, catalog: PrefabComponentCatalog): string {
  let url = thumbCache.get(doc);
  if (!url) {
    try {
      url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(prefabBlueprintSvg(doc, catalog, { scale: 9, margin: 1, title: false, stats: false }))}`;
    } catch {
      url = "";
    }
    thumbCache.set(doc, url);
  }
  return url;
}

function when(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Card({ entry, catalog, store }: { entry: LibraryEntry; catalog: PrefabComponentCatalog; store: PrefabStore }) {
  const d = entry.doc;
  const [x0, y0, x1, y1] = prefabBounds(geometriesOf(d));
  const src = thumbnail(d, catalog);
  return (
    <article className="pf-card" data-prefab={entry.id}>
      <button className="pf-card-open" onClick={() => store.open(entry.id)} aria-label={`Open ${d.name}`}>
        {src ? <img src={src} alt="" /> : <span className="pf-card-empty">No plan yet</span>}
      </button>
      <div className="pf-card-body">
        <h2>{d.name}</h2>
        <p className="pf-card-id">{entry.id}</p>
        <p>
          {[d.role, d.faction].filter(Boolean).join(", ") || "No role set"}. Size {d.sizeClass}, {x1 - x0} x {y1 - y0} m.
        </p>
        <p className="pf-card-meta">
          <ThemeSwatches theme={d.theme} />
          <span>
            {entry.template && entry.draft ? `Template with local draft, ${when(entry.draft.savedAt)}` : entry.template ? "Developer template" : `Draft, ${when(entry.draft?.savedAt ?? "")}`}
          </span>
        </p>
        <div className="pf-row">
          <button className="layout-primary" onClick={() => store.open(entry.id)}>
            Open
          </button>
          <button onClick={() => store.duplicate(d)} title="Duplicate as a new draft">
            <Copy size={14} /> Duplicate
          </button>
          {entry.draft && (
            <button
              className="pf-danger"
              onClick={() => {
                if (confirm(entry.template ? `Discard the local draft of ${d.name}? The template stays.` : `Delete the draft ${d.name}? This cannot be undone.`)) store.deleteDraft(entry.id);
              }}
            >
              <Trash2 size={14} /> {entry.template ? "Discard draft" : "Delete"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function PrefabLibrary({ store, catalog }: { store: PrefabStore; catalog: PrefabComponentCatalog }) {
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idEdited, setIdEdited] = useState(false);
  const [sizeClass, setSizeClass] = useState<BlueprintSizeClassId>("S");
  const [theme, setTheme] = useState<ShipThemeId>("federation");
  const [message, setMessage] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const suggested = useMemo(
    () =>
      `${theme === "federation" ? "fed" : theme.slice(0, 4)}.${sizeClass.toLowerCase()}.${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}`,
    [name, sizeClass, theme],
  );
  const effectiveId = idEdited ? id : suggested;
  const templates = store.library.filter((e) => e.template);
  const drafts = store.library.filter((e) => !e.template);
  return (
    <main className="layout-editor prefab-library">
      <header className="pf-library-head">
        <div>
          <h1>Prefab ships</h1>
          <p>Grammar-built ship blueprints. Open a developer template or a draft, or start a new hull.</p>
        </div>
        <a className="pf-link" href="/shipyard">
          Layout planner
        </a>
      </header>
      {(store.error || message) && (
        <div className="layout-alert" role="alert">
          <span>{store.error || message}</span>
          <button
            onClick={() => {
              store.setError("");
              setMessage("");
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="pf-library-body">
        <form
          className="pf-new"
          onSubmit={(e) => {
            e.preventDefault();
            const err = store.create({ id: effectiveId, name: name.trim(), sizeClass, theme });
            setMessage(err ?? "");
          }}
        >
          <h2>New ship</h2>
          <label className="pf-field">
            <span>Name</span>
            <input value={name} required maxLength={32} onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9 ._/'&-]/g, ""))} placeholder="Kestrel" />
          </label>
          <label className="pf-field">
            <span>Blueprint id</span>
            <input
              value={effectiveId}
              onChange={(e) => {
                setIdEdited(true);
                setId(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""));
              }}
            />
          </label>
          <fieldset className="pf-field">
            <legend>Size class</legend>
            <div className="pf-segmented" role="radiogroup" aria-label="Size class">
              {BLUEPRINT_SIZE_CLASS_IDS.map((s) => (
                <button type="button" key={s} role="radio" aria-checked={sizeClass === s} onClick={() => setSizeClass(s)}>
                  {s}
                </button>
              ))}
            </div>
            <small>
              {G.blueprintSizeClasses[sizeClass].label}: up to {G.blueprintSizeClasses[sizeClass].maxCells.join(" x ")} m, {G.blueprintSizeClasses[sizeClass].maxMount} mounts,{" "}
              {G.blueprintSizeClasses[sizeClass].maxMounts} hardpoints.
            </small>
          </fieldset>
          <fieldset className="pf-field">
            <legend>Theme</legend>
            <div className="pf-themes compact" role="radiogroup" aria-label="Theme">
              {SHIP_THEME_IDS.map((t) => (
                <button type="button" key={t} role="radio" aria-checked={theme === t} onClick={() => setTheme(t)}>
                  <span>{SHIP_THEMES[t].label}</span>
                  <ThemeSwatches theme={t} />
                </button>
              ))}
            </div>
          </fieldset>
          <div className="pf-row">
            <button className="layout-primary" type="submit" disabled={!name.trim()}>
              <Plus size={14} /> Create
            </button>
            <button type="button" onClick={() => file.current?.click()}>
              <FileUp size={14} /> Import JSON
            </button>
          </div>
          <p className="layout-note">A new ship starts as an 8 x 4 m deck hull with a bridge. Drafts save in this browser until published.</p>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) setMessage((await store.importJson(await f.text())) ?? "");
            }}
          />
        </form>
        <div className="pf-library-lists">
          <h2>Developer templates</h2>
          <div className="pf-cards">
            {templates.map((e) => (
              <Card key={e.id} entry={e} catalog={catalog} store={store} />
            ))}
          </div>
          <h2>Drafts</h2>
          {drafts.length ? (
            <div className="pf-cards">
              {drafts.map((e) => (
                <Card key={e.id} entry={e} catalog={catalog} store={store} />
              ))}
            </div>
          ) : (
            <p className="layout-note">No drafts yet. Create a ship, duplicate a template or import a JSON document.</p>
          )}
        </div>
      </div>
    </main>
  );
}
