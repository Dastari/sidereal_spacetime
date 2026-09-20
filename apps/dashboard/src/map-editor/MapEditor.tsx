import { systemCenter } from "@sidereal/sim/space-background";
import { useMemo, useState, useEffect, useRef } from "react";
import { SHARED_SYSTEM_SEED } from "@sidereal/content/shared-system";
import {
  mapBodyName,
  mapBodyOutline,
  mapBodyMetadata,
  moveMapBody,
  mapBodyRole,
  MAP_WORKSPACE,
  newSystemMap,
  newAsteroidField,
  type SystemMapDocument,
} from "@sidereal/content/system-map";
import {
  fieldVolume,
  validateSystemMap,
  generateField,
  readSystemMap,
} from "@sidereal/sim/system-map";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { useMapConnection } from "./useMapConnection";
import MapCanvas, { type Camera } from "./MapCanvas";
import MapInspector from "./MapInspector";
import "./map-editor.css";
const stock = () => ({
  ...newSystemMap(
    SHARED_SYSTEM_SEED.systemId,
    SHARED_SYSTEM_SEED.bodies
      .filter((b) => b.kind !== "asteroid")
      .map((b) => ({
        id: b.id,
        name: mapBodyName(b.id, b.key),
        kind: b.kind,
        radius: b.radius,
        x: b.x,
        y: b.y,
        height: b.height,
      })),
  ),
  name: "Helion system",
});
interface Draft {
  doc: SystemMapDocument;
  revision: string;
  fingerprint: string;
  past: SystemMapDocument[];
  future: SystemMapDocument[];
}
const initial = (): Draft => ({
  doc: stock(),
  revision: "0",
  fingerprint: "",
  past: [],
  future: [],
});
const fit = (d: SystemMapDocument): Camera => {
  const rect = document.querySelector(".map-chart")?.getBoundingClientRect();
  const aspect = rect?.height ? rect.width / rect.height : 1.6;
  return {
    x: systemCenter(d).x,
    y: systemCenter(d).y,
    span: d.radius * 2.3 * Math.max(1, aspect),
  };
};
const clone = (d: SystemMapDocument) =>
  JSON.parse(JSON.stringify(d)) as SystemMapDocument;
export default function MapEditor() {
  return <SystemMapWorkspace live={useMapConnection()} />;
}
export function SystemMapWorkspace({
  live,
}: {
  live: ReturnType<typeof useMapConnection>;
}) {
  const [draft, setDraft] = useState<Draft>(initial),
    [selected, setSelected] = useState(""),
    [camera, setCamera] = useState<Camera>(() => fit(stock())),
    [drawing, setDrawing] = useState<{ x: number; y: number }[] | null>(null),
    [layers, setLayers] = useState({
      bodies: true,
      ships: true,
      fields: true,
      grid: true,
      orbits: true,
    }),
    [previewHeight, setPreviewHeight] = useState(0),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(""),
    [scope, setScope] = useState("");
  const pending = useRef<{ request: string; operationId: string } | null>(null);
  const doc = draft.doc,
    key = `sidereal:system-map:v1:${live.user?.profile.sub ?? "local"}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const data = JSON.parse(raw) as Draft;
        data.doc = readSystemMap(JSON.stringify(data.doc));
        data.doc.bodies = data.doc.bodies.map((b) => ({
          ...mapBodyMetadata(b.id),
          ...b,
        }));
        if (
          typeof data.revision !== "string" ||
          !/^\d+$/.test(data.revision) ||
          typeof data.fingerprint !== "string"
        )
          throw Error("Invalid draft revision");
        setDraft({ ...data, past: [], future: [] });
        setCamera(fit(data.doc));
      } else {
        setDraft(initial());
        setCamera(fit(stock()));
      }
      setError("");
    } catch (e) {
      setError(`Saved map could not be restored: ${String(e)}`);
    }
    setScope(key);
  }, [key]);
  const edit = (update: (d: SystemMapDocument) => void) => {
    setDraft((old) => {
      const next = clone(old.doc);
      update(next);
      return {
        ...old,
        doc: next,
        past: [...old.past.slice(-49), old.doc],
        future: [],
      };
    });
    setSaved("Unsaved changes");
  };
  const preview = useMemo(() => {
    try {
      const count = validateSystemMap(doc);
      return { count, rocks: doc.fields.flatMap(generateField), error: "" };
    } catch (e) {
      return { count: 0, rocks: [], error: String(e) };
    }
  }, [doc]);
  const maps = live.connection
      ? [...live.connection.db.ownSystemMaps.iter()]
      : [],
    ships =
      live.status === "ready" && live.connection
        ? [...live.connection.db.ownMapShips.iter()].filter(
            (s) => s.systemId === doc.id,
          )
        : [],
    grants = live.connection
      ? [...live.connection.db.ownConstructionGrants.iter()].filter(
          (g) => g.workspaceId === MAP_WORKSPACE && !g.revoked,
        )
      : [];
  const active = maps.find((m) => m.id === doc.id),
    readable = grants.some((g) => g.capability === "draft.read"),
    writable = readable && grants.some((g) => g.capability === "draft.write");
  const load = (id: string) => {
    const row = maps.find((m) => m.id === id);
    if (!row) return;
    const next = readSystemMap(row.documentJson);
    setDraft({
      doc: next,
      revision: row.revision.toString(),
      fingerprint: row.sourceFingerprint,
      past: [],
      future: [],
    });
    setCamera(fit(next));
    setSelected("");
    setSaved("Loaded live revision " + row.revision);
  };
  useEffect(() => {
    if (
      live.status !== "ready" ||
      !active ||
      scope !== key ||
      draft.fingerprint ||
      draft.past.length
    )
      return;
    try {
      if (!localStorage.getItem(key)) load(active.id);
    } catch {
      /* Storage availability does not authorize replacing a draft. */
    }
  }, [
    live.status,
    active?.id,
    active?.revision,
    active?.sourceFingerprint,
    scope,
  ]);
  const save = () => {
    try {
      if (scope !== key) throw Error("Account draft is still loading");
      if (preview.error) throw Error(preview.error);
      localStorage.setItem(key, JSON.stringify(draft));
      setSaved("Saved locally");
    } catch (e) {
      setError(String(e));
    }
  };
  const apply = async () => {
    if (!live.connection || !writable || busy) return;
    setBusy(true);
    setError("");
    const request = JSON.stringify({
      documentJson: JSON.stringify(doc),
      expectedRevision: draft.revision,
      sourceFingerprint: draft.fingerprint,
    });
    if (pending.current?.request !== request)
      pending.current = {
        request,
        operationId:
          crypto.randomUUID?.() ??
          `map-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      };
    try {
      await live.connection.reducers.applySystemMap({
        documentJson: JSON.stringify(doc),
        expectedRevision: BigInt(draft.revision),
        sourceFingerprint: draft.fingerprint,
        operationId: pending.current.operationId,
      });
      setSaved("Applied to world");
      pending.current = null;
      const row = live.connection.db.ownSystemMaps.id.find(doc.id);
      if (row)
        setDraft((old) =>
          old.doc.id !== doc.id
            ? old
            : {
                ...old,
                revision: row.revision.toString(),
                fingerprint: row.sourceFingerprint,
                past: [],
                future: [],
              },
        );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const add = (shape: "box" | "ellipsoid") => {
    const f = newAsteroidField(`field-${Date.now()}`, camera.x, camera.y);
    f.shape = shape;
    setCamera({ x: f.x, y: f.y, span: 2500 });
    edit((d) => {
      d.fields.push(f);
    });
    setSelected(f.id);
  };
  const finish = () => {
    if (!drawing || drawing.length < 3) return;
    const f = newAsteroidField(`field-${Date.now()}`);
    f.shape = "polygon";
    const xs = drawing.map((p) => p.x),
      ys = drawing.map((p) => p.y);
    f.x = (Math.min(...xs) + Math.max(...xs)) / 2;
    f.y = (Math.min(...ys) + Math.max(...ys)) / 2;
    f.width = Math.max(...xs) - Math.min(...xs);
    f.length = Math.max(...ys) - Math.min(...ys);
    f.vertices = drawing.map((p) => ({ x: p.x - f.x, y: p.y - f.y }));
    f.density = Math.min(1e9, 100 / (fieldVolume(f) / 1e9));
    edit((d) => {
      d.fields.push(f);
    });
    setSelected(f.id);
    setDrawing(null);
  };
  const undo = (redo = false) =>
    setDraft((old) => {
      const stack = redo ? old.future : old.past,
        target = stack.at(-1);
      if (!target) return old;
      return {
        ...old,
        doc: target,
        past: redo ? [...old.past, old.doc] : old.past.slice(0, -1),
        future: redo ? old.future.slice(0, -1) : [...old.future, old.doc],
      };
    });
  return (
    <main className="system-map-editor">
      <header className="map-document-bar">
        <h1>System map</h1>
        <span role="status">
          {live.status === "ready" ? "Live connection" : live.status}{" "}
          {saved && `· ${saved}`}
        </span>
        <button disabled={!draft.past.length || busy} onClick={() => undo()}>
          Undo
        </button>
        <button
          disabled={!draft.future.length || busy}
          onClick={() => undo(true)}
        >
          Redo
        </button>
        <button
          disabled={busy}
          onClick={() => {
            const d = newSystemMap(`system-${Date.now()}`);
            setDraft({
              doc: d,
              revision: "0",
              fingerprint: constructionHash("[]"),
              past: [],
              future: [],
            });
            setCamera(fit(d));
            setSelected("");
          }}
        >
          New system
        </button>
        <button onClick={save}>Save draft</button>
        {!live.user ? (
          <button onClick={() => void live.signIn()}>Sign in</button>
        ) : (
          <button
            className="primary"
            disabled={
              !writable ||
              busy ||
              !!preview.error ||
              !draft.fingerprint ||
              live.status !== "ready"
            }
            onClick={() => void apply()}
          >
            {busy ? "Applying…" : "Apply to world"}
          </button>
        )}
      </header>
      <div className="map-toolbar">
        <button onClick={() => setCamera(fit(doc))}>Fit system</button>
        <button
          aria-label="Zoom in"
          onClick={() =>
            setCamera((c) => ({ ...c, span: Math.max(10, c.span / 2) }))
          }
        >
          ＋
        </button>
        <button
          aria-label="Zoom out"
          onClick={() =>
            setCamera((c) => ({ ...c, span: Math.min(2e9, c.span * 2) }))
          }
        >
          −
        </button>
        {(Object.keys(layers) as (keyof typeof layers)[]).map((k) => (
          <label className="map-toggle" key={k}>
            <input
              type="checkbox"
              checked={layers[k]}
              onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })}
            />
            {k === "bodies"
              ? "Celestials"
              : k === "ships"
                ? "Live ships"
                : k === "fields"
                  ? "Asteroid fields"
                  : k === "orbits"
                    ? "Orbit guides"
                    : "Grid"}
          </label>
        ))}
        <label className="map-toggle">
          Preview height (m)
          <input
            aria-label="Preview height (m)"
            type="number"
            value={previewHeight}
            min={-1e9}
            max={1e9}
            style={{ width: 100 }}
            onChange={(e) => {
              const h = Number(e.target.value);
              if (Number.isFinite(h))
                setPreviewHeight(Math.max(-1e9, Math.min(1e9, h)));
            }}
          />
        </label>
        <span>Drag to move · drag empty space to pan · wheel to zoom</span>
      </div>
      {(error || live.error) && (
        <p role="alert" className="map-error">
          {error || live.error}
          <button onClick={() => setError("")}>Dismiss</button>
        </p>
      )}
      <div className="map-workbench">
        <aside className="map-library">
          <label>
            Live systems
            <select
              aria-label="Live systems"
              disabled={busy}
              value={active?.id ?? ""}
              onChange={(e) => load(e.target.value)}
            >
              <option value="">
                {live.status === "ready"
                  ? "Select a system"
                  : "Connect to load the world"}
              </option>
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {JSON.parse(m.documentJson).name}
                </option>
              ))}
            </select>
          </label>
          <button disabled={!active || busy} onClick={() => load(doc.id)}>
            Reload live map
          </button>
          {live.status === "ready" && !readable && (
            <p>
              Ask an administrator for read/write access to the universe-map
              workspace.
            </p>
          )}
          {!draft.fingerprint && (
            <p>
              Local authored reference. Load the live map before applying
              changes.
            </p>
          )}
          <button
            className={selected === "" ? "selected" : ""}
            onClick={() => setSelected("")}
          >
            {doc.name}
          </button>
          <input
            type="search"
            aria-label="Search map"
            placeholder="Find a body or field…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <h2>Celestials</h2>
          <div className="map-body-list">
            {mapBodyOutline(doc.bodies)
              .filter((b) =>
                b.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((b) => (
                <button
                  className={selected === b.id ? "selected" : ""}
                  key={b.id}
                  data-depth={
                    b.parentId
                      ? doc.bodies.find((p) => p.id === b.parentId)?.parentId
                        ? 2
                        : 1
                      : 0
                  }
                  onClick={() => {
                    setSelected(b.id);
                    setCamera({
                      x: b.x,
                      y: b.y,
                      span: Math.max(500, b.radius * 10),
                    });
                  }}
                >
                  <span className={`map-dot ${mapBodyRole(b, doc.bodies)}`} />
                  {b.name}
                  <small>{mapBodyRole(b, doc.bodies)}</small>
                </button>
              ))}
          </div>
          <h2>Asteroid fields</h2>
          {doc.fields
            .filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
            .map((f) => (
              <button
                className={selected === f.id ? "selected" : ""}
                key={f.id}
                onClick={() => {
                  setSelected(f.id);
                  setCamera({
                    x: f.x,
                    y: f.y,
                    span: Math.max(f.width, f.length, 2000) * 2,
                  });
                }}
              >
                {f.name}
              </button>
            ))}
          <div className="map-add-fields">
            <button onClick={() => add("ellipsoid")}>Add ellipsoid</button>
            <button onClick={() => add("box")}>Add box</button>
            <button onClick={() => setDrawing([])}>Draw polygon</button>
          </div>
          <h2>Live ships · {ships.length}</h2>
          {ships.map((s) => (
            <button
              key={s.shipId}
              onClick={() => {
                setSelected(s.shipId);
                setCamera({ x: s.x, y: s.y, span: 500 });
              }}
            >
              {s.name}
            </button>
          ))}
        </aside>
        <div className="map-stage">
          {drawing && (
            <div className="map-draw-toolbar">
              <span>Click vertices · {drawing.length} points</span>
              <button disabled={drawing.length < 3} onClick={finish}>
                Finish field
              </button>
              <button onClick={() => setDrawing(null)}>Cancel</button>
            </div>
          )}
          <MapCanvas
            doc={doc}
            ships={ships}
            asteroids={preview.rocks}
            selection={selected}
            onSelect={setSelected}
            onMove={(id, x, y) =>
              edit((d) => {
                const target =
                  d.bodies.find((b) => b.id === id) ??
                  d.fields.find((f) => f.id === id);
                if (d.bodies.some((b) => b.id === id) && target) {
                  moveMapBody(d, id, { x, y, height: target.height });
                  return;
                }
                if (target) {
                  target.x = x;
                  target.y = y;
                }
              })
            }
            onVertex={(id, index, x, y) =>
              edit((d) => {
                const f = d.fields.find((f) => f.id === id)!;
                f.vertices[index] = { x: x - f.x, y: y - f.y };
              })
            }
            camera={camera}
            setCamera={setCamera}
            layers={layers}
            previewHeight={previewHeight}
            drawing={drawing}
            onDraw={(p) =>
              setDrawing((v) => [
                ...(v ?? []),
                { x: Math.round(p.x), y: Math.round(p.y) },
              ])
            }
          />
          <footer className={preview.error ? "map-error" : "map-summary"}>
            {preview.error ||
              `${doc.bodies.length} celestial bodies · ${ships.length} live ships · ${preview.count} generated asteroids`}
          </footer>
        </div>
        <MapInspector
          doc={doc}
          selected={selected}
          ships={ships}
          edit={edit}
          onDelete={() => {
            edit((d) => {
              d.fields = d.fields.filter((f) => f.id !== selected);
            });
            setSelected("");
          }}
        />
      </div>
    </main>
  );
}
