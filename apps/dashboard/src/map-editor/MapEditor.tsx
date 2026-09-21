import {
  MousePointer2,
  Spline,
  Hand,
  Copy,
  Trash2,
  Scan,
  ZoomIn,
  ZoomOut,
  Undo2,
  Redo2,
  Plus,
  Save,
  Upload,
  LogIn,
  RefreshCw,
  Square,
  Circle,
  Pentagon,
  X,
  Settings2,
} from "lucide-react";
import type { ReactNode } from "react";
import UniverseTree from "./UniverseTree";
import { NumberField } from "@sidereal/ui/property-controls";
import { editorCommand, editorKeyTarget } from "@sidereal/ui/editor-commands";
import { newMapZone } from "@sidereal/content/zones";
import { splitZoneEdge, setZoneHandle } from "@sidereal/sim/zone-path";
import {
  mapZones,
  moveMapSelection,
  duplicateMapSelection,
  deleteMapSelection,
} from "./map-commands";
import { GenericZoneInspector } from "./ZoneProperties";
import { systemCenter } from "@sidereal/sim/space-background";
import { useMemo, useState, useEffect, useRef } from "react";
import { SHARED_SYSTEM_SEED } from "@sidereal/content/shared-system";
import {
  mapBodyName,
  mapBodyMetadata,
  MAP_WORKSPACE,
  newSystemMap,
  newAsteroidField,
  type SystemMapDocument,
} from "@sidereal/content/system-map";
import {
  validateSystemMap,
  generateMapFields,
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
  editGroup?: string;
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
    [selection, setSelection] = useState<string[]>([]),
    [tool, setTool] = useState<"select" | "direct" | "pan">("select"),
    [pointIndex, setPointIndex] = useState<number | null>(null),
    [cancelToken, setCancelToken] = useState(0),
    [camera, setCamera] = useState<Camera>(() => fit(stock())),
    [drawing, setDrawing] = useState<{ x: number; y: number }[] | null>(null),
    [drawFuture, setDrawFuture] = useState<{ x: number; y: number }[]>([]),
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
  const selected = selection.at(-1) ?? "";
  const setSelected = (id: string, additive = false) => {
    setPointIndex(null);
    setSelection((old) =>
      additive
        ? old.includes(id)
          ? old.filter((x) => x !== id)
          : [...old, id]
        : id
          ? [id]
          : [],
    );
  };
  const gesture = useRef<string | null>(null);
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
    const editGroup = gesture.current ?? undefined;
    setDraft((old) => {
      const next = clone(old.doc);
      update(next);
      if (JSON.stringify(next) === JSON.stringify(old.doc)) return old;
      const coalesced = editGroup !== undefined && old.editGroup === editGroup;
      return {
        ...old,
        doc: next,
        editGroup,
        past: coalesced ? old.past : [...old.past.slice(-49), old.doc],
        future: [],
      };
    });
    setSaved("Unsaved changes");
  };
  const preview = useMemo(() => {
    try {
      const count = validateSystemMap(doc);
      return { count, rocks: generateMapFields(doc), error: "" };
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
  const load = (id: string, selectedId = id) => {
    const row = maps.find((m) => m.id === id);
    if (!row) return;
    let next: SystemMapDocument;
    try {
      next = readSystemMap(row.documentJson);
    } catch (e) {
      setError(`Unable to load system: ${String(e)}`);
      return;
    }
    setDraft({
      doc: next,
      revision: row.revision.toString(),
      fingerprint: row.sourceFingerprint,
      past: [],
      future: [],
    });
    setCamera(fit(next));
    setSelected(selectedId);
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
    const f = newMapZone(`zone-${crypto.randomUUID()}`);
    f.shape = "polygon";
    const xs = drawing.map((p) => p.x),
      ys = drawing.map((p) => p.y);
    f.x = (Math.min(...xs) + Math.max(...xs)) / 2;
    f.y = (Math.min(...ys) + Math.max(...ys)) / 2;
    f.width = Math.max(...xs) - Math.min(...xs);
    f.length = Math.max(...ys) - Math.min(...ys);
    f.vertices = drawing.map((p) => ({ x: p.x - f.x, y: p.y - f.y }));
    edit((d) => {
      (d.zones ??= []).push(f);
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
        editGroup: undefined,
        past: redo ? [...old.past, old.doc] : old.past.slice(0, -1),
        future: redo ? old.future.slice(0, -1) : [...old.future, old.doc],
      };
    });
  const remove = (wholeObject = false) => {
    if (!wholeObject && tool === "direct" && pointIndex !== null) {
      const z = mapZones(doc).find((z) => z.id === selected);
      if (z && z.vertices.length > 3)
        edit((d) => {
          mapZones(d)
            .find((z) => z.id === selected)!
            .vertices.splice(pointIndex, 1);
        });
      setPointIndex(null);
      return;
    }
    if (!selection.some((id) => mapZones(doc).some((z) => z.id === id))) {
      setError("Live ships and catalog celestials cannot be deleted here.");
      return;
    }
    edit((d) => deleteMapSelection(d, selection));
    setSelection([]);
  };
  const duplicate = () => {
    if (!selection.some((id) => mapZones(doc).some((z) => z.id === id))) {
      setError("Select zones or asteroid fields to duplicate.");
      return;
    }
    const next = clone(doc),
      ids = duplicateMapSelection(
        next,
        selection,
        () => `zone-${crypto.randomUUID()}`,
        Math.max(1, camera.span / 100),
      );
    edit((d) => Object.assign(d, next));
    setSelection(ids);
    setPointIndex(null);
  };
  return (
    <main
      className="system-map-editor"
      tabIndex={-1}
      onFocusCapture={(e) => {
        if (editorKeyTarget(e.target)) gesture.current = crypto.randomUUID();
      }}
      onBlurCapture={() => {
        gesture.current = null;
      }}
      onKeyDown={(e) => {
        if (editorKeyTarget(e.target) || busy) return;
        if (drawing && e.key === "Enter") {
          e.preventDefault();
          finish();
          return;
        }
        const command = editorCommand(e);
        if (!command) return;
        e.preventDefault();
        if (
          document.querySelector(".map-chart [data-gesture-active=true]") &&
          !["cancel", "undo", "redo"].includes(command)
        )
          return;
        if (drawing) {
          if (command === "undo" || command === "delete") {
            const last = drawing.at(-1);
            if (last) {
              setDrawing(drawing.slice(0, -1));
              setDrawFuture((old) => [...old, last]);
            }
            return;
          }
          if (command === "redo") {
            const next = drawFuture.at(-1);
            if (next) {
              setDrawing([...drawing, next]);
              setDrawFuture(drawFuture.slice(0, -1));
            }
            return;
          }
          if (
            ["duplicate", "left", "right", "up", "down", "draw"].includes(
              command,
            )
          )
            return;
        }
        if (command === "cancel") {
          setCancelToken((n) => n + 1);
          if (drawing) setDrawing(null);
          else {
            setSelection([]);
            setPointIndex(null);
          }
          return;
        }
        if (command === "undo" || command === "redo") {
          setCancelToken((n) => n + 1);
          undo(command === "redo");
          return;
        }
        if (command === "select" || command === "direct" || command === "pan") {
          setTool(command);
          setDrawing(null);
          return;
        }
        if (command === "draw") {
          setDrawing([]);
          setDrawFuture([]);
          return;
        }
        if (command === "save") {
          save();
          return;
        }
        if (command === "duplicate") {
          duplicate();
          return;
        }
        if (command === "delete") {
          remove();
          return;
        }
        const step = e.shiftKey ? 10 : 1,
          dx = command === "left" ? -step : command === "right" ? step : 0,
          dy = command === "down" ? -step : command === "up" ? step : 0;
        if (dx || dy)
          edit((d) => {
            const z = mapZones(d).find((z) => z.id === selected),
              a = pointIndex === null ? undefined : z?.vertices[pointIndex];
            if (tool === "direct" && a) {
              a.x += dx;
              a.y += dy;
            } else moveMapSelection(d, selection, dx, dy);
          });
      }}
    >
      {(error || live.error) && (
        <p role="alert" className="map-error">
          {error || live.error}
          <button onClick={() => setError("")}>Dismiss</button>
        </p>
      )}
      <div className="map-workbench">
        <aside className="map-library">
          <div
            className="map-drawer-actions"
            role="toolbar"
            aria-label="Map commands"
          >
            <IconButton
              label="Undo (Ctrl+Z)"
              disabled={!draft.past.length || busy}
              onClick={() => undo()}
            >
              <Undo2 />
            </IconButton>
            <IconButton
              label="Redo (Ctrl+Shift+Z)"
              disabled={!draft.future.length || busy}
              onClick={() => undo(true)}
            >
              <Redo2 />
            </IconButton>
            <IconButton
              label="New system"
              disabled={busy}
              onClick={() => {
                const d = newSystemMap(`system-${crypto.randomUUID()}`);
                setDraft({
                  doc: d,
                  revision: "0",
                  fingerprint: constructionHash("[]"),
                  past: [],
                  future: [],
                });
                setCamera(fit(d));
                setSelected(d.id);
              }}
            >
              <Plus />
            </IconButton>
            <IconButton label="Save draft (Ctrl+S)" onClick={save}>
              <Save />
            </IconButton>
            <IconButton
              label="Reload live map"
              disabled={!active || busy}
              onClick={() => load(doc.id)}
            >
              <RefreshCw />
            </IconButton>
            {!live.user ? (
              <IconButton label="Sign in" onClick={() => void live.signIn()}>
                <LogIn />
              </IconButton>
            ) : (
              <IconButton
                label={busy ? "Applying…" : "Apply to world"}
                disabled={
                  !writable ||
                  busy ||
                  !!preview.error ||
                  !draft.fingerprint ||
                  live.status !== "ready"
                }
                onClick={() => void apply()}
              >
                <Upload />
              </IconButton>
            )}
            <IconButton
              label="Select (V)"
              pressed={tool === "select" && !drawing}
              onClick={() => {
                setTool("select");
                setDrawing(null);
              }}
            >
              <MousePointer2 />
            </IconButton>
            <IconButton
              label="Points (A)"
              pressed={tool === "direct" && !drawing}
              onClick={() => {
                setTool("direct");
                setDrawing(null);
              }}
            >
              <Spline />
            </IconButton>
            <IconButton
              label="Pan (H)"
              pressed={tool === "pan" && !drawing}
              onClick={() => {
                setTool("pan");
                setDrawing(null);
              }}
            >
              <Hand />
            </IconButton>
            <IconButton
              label="Deselect (Esc)"
              disabled={!selection.length && !drawing}
              onClick={() => {
                setSelected("");
                setDrawing(null);
                setCancelToken((n) => n + 1);
              }}
            >
              <X />
            </IconButton>
            <IconButton
              label="Duplicate (Ctrl+D)"
              disabled={!selection.length || !!drawing}
              onClick={duplicate}
            >
              <Copy />
            </IconButton>
            <IconButton
              label="Delete selection"
              disabled={!selection.length || !!drawing}
              onClick={() => remove(true)}
            >
              <Trash2 />
            </IconButton>
            <IconButton label="Fit system" onClick={() => setCamera(fit(doc))}>
              <Scan />
            </IconButton>
            <IconButton
              label="Zoom in"
              onClick={() =>
                setCamera((c) => ({ ...c, span: Math.max(10, c.span / 2) }))
              }
            >
              <ZoomIn />
            </IconButton>
            <IconButton
              label="Zoom out"
              onClick={() =>
                setCamera((c) => ({ ...c, span: Math.min(2e9, c.span * 2) }))
              }
            >
              <ZoomOut />
            </IconButton>
            <IconButton
              label="Add zone"
              onClick={() => {
                const z = newMapZone(
                  `zone-${crypto.randomUUID()}`,
                  camera.x,
                  camera.y,
                );
                edit((d) => {
                  (d.zones ??= []).push(z);
                });
                setSelected(z.id);
              }}
            >
              <Square />
            </IconButton>
            <IconButton
              label="Draw polygon zone (P)"
              pressed={!!drawing}
              onClick={() => {
                setDrawing([]);
                setDrawFuture([]);
              }}
            >
              <Pentagon />
            </IconButton>
            <details className="map-add-menu">
              <summary
                aria-label="Add asteroid field"
                title="Add asteroid field"
              >
                <Circle size={17} />
              </summary>
              <div>
                <button onClick={() => add("ellipsoid")}>
                  Add ellipsoid field
                </button>
                <button onClick={() => add("box")}>Add box field</button>
              </div>
            </details>
          </div>
          <input
            type="search"
            aria-label="Search Universe"
            placeholder="Search names or IDs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <UniverseTree
            doc={doc}
            maps={maps}
            ships={
              live.connection ? [...live.connection.db.ownMapShips.iter()] : []
            }
            search={search}
            selection={selection}
            onSelect={setSelected}
            onLoad={load}
            busy={busy}
            onFrame={(id) => {
              if (id === doc.id) {
                setCamera(fit(doc));
                return;
              }
              const body = doc.bodies.find((b) => b.id === id),
                zone = mapZones(doc).find((z) => z.id === id),
                ship = ships.find((s) => s.shipId === id);
              const target = body ?? zone ?? ship;
              if (target)
                setCamera({
                  x: target.x,
                  y: target.y,
                  span: body
                    ? Math.max(500, body.radius * 10)
                    : zone
                      ? Math.max(zone.width, zone.length, 1000) * 2
                      : 500,
                });
            }}
          />
          <details className="map-display-options">
            <summary>
              <Settings2 size={15} /> Display options
            </summary>
            {(Object.keys(layers) as (keyof typeof layers)[]).map((k) => (
              <label className="map-layer-toggle" key={k}>
                <input
                  type="checkbox"
                  checked={layers[k]}
                  onChange={(e) =>
                    setLayers({ ...layers, [k]: e.target.checked })
                  }
                />
                {
                  {
                    bodies: "Celestials",
                    ships: "Live ships",
                    fields: "Zones",
                    orbits: "Orbit guides",
                    grid: "Grid",
                  }[k]
                }
              </label>
            ))}
            <NumberField
              label="Preview height (m)"
              value={previewHeight}
              min={-1e9}
              max={1e9}
              onChange={setPreviewHeight}
            />
          </details>
          <p role="status">
            {live.status === "ready" ? "Live connection" : live.status}
            {saved && ` · ${saved}`}
          </p>
          {!draft.fingerprint && (
            <p>Local draft. Load a live system to edit the world.</p>
          )}
          {live.status === "ready" && !readable && (
            <p>Universe-map access is required to load live systems.</p>
          )}
          <p className="map-hint">
            Click to select · Double-click to frame
            <br />
            Shift-click to add · Esc to deselect
            <br />
            Right-drag or Space-drag to pan
          </p>
        </aside>
        <div className="map-stage">
          {drawing && (
            <div className="map-draw-toolbar">
              <span>Click vertices · {drawing.length} points</span>
              <button disabled={drawing.length < 3} onClick={finish}>
                Finish zone
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
            selections={selection}
            tool={tool}
            pointIndex={pointIndex}
            onPointSelect={setPointIndex}
            cancelToken={cancelToken}
            onMarquee={(ids, additive) => {
              setPointIndex(null);
              setSelection((old) =>
                additive ? [...new Set([...old, ...ids])] : ids,
              );
            }}
            onHandle={(id, index, side, x, y, independent) =>
              edit((d) => {
                const z = mapZones(d).find((z) => z.id === id)!;
                const a = z.vertices[index];
                setZoneHandle(
                  a,
                  side,
                  { x: x - z.x - a.x, y: y - z.y - a.y },
                  independent,
                );
              })
            }
            onInsert={(id, index, t) => {
              if (
                (mapZones(doc).find((z) => z.id === id)?.vertices.length ??
                  64) >= 64
              ) {
                setError("A path can contain at most 64 anchors.");
                return;
              }
              edit((d) =>
                splitZoneEdge(
                  mapZones(d).find((z) => z.id === id)!.vertices,
                  index,
                  t,
                ),
              );
              setPointIndex(index + 1);
            }}

            onMove={(id, x, y) => {
              const target = [...doc.bodies, ...mapZones(doc)].find(
                (z) => z.id === id,
              );
              if (target)
                edit((d) =>
                  moveMapSelection(
                    d,
                    selection.includes(id) ? selection : [id],
                    x - target.x,
                    y - target.y,
                  ),
                );
            }}
            onVertex={(id, index, x, y) =>
              edit((d) => {
                const z = mapZones(d).find((z) => z.id === id)!;
                Object.assign(z.vertices[index], { x: x - z.x, y: y - z.y });
              })
            }
            camera={camera}
            setCamera={setCamera}
            layers={layers}
            previewHeight={previewHeight}
            drawing={drawing}
            onDraw={(p) => {
              setDrawFuture([]);
              setDrawing((v) => [
                ...(v ?? []),
                { x: Math.round(p.x), y: Math.round(p.y) },
              ]);
            }}
          />
          <footer className={preview.error ? "map-error" : "map-summary"}>
            {preview.error ||
              `${doc.bodies.length} celestial bodies · ${ships.length} live ships · ${preview.count} generated asteroids`}
          </footer>
        </div>
        {doc.zones?.some((z) => z.id === selected) ? (
          <GenericZoneInspector
            doc={doc}
            zone={doc.zones.find((z) => z.id === selected)!}
            edit={edit}
            point={pointIndex}
            setPoint={setPointIndex}
            onDelete={() => remove(true)}
          />
        ) : (
          <MapInspector
            point={pointIndex}
            setPoint={setPointIndex}
            doc={doc}
            selected={selected}
            ships={ships}
            edit={edit}
            onDelete={() => remove(true)}
          />
        )}
      </div>
    </main>
  );
}

function IconButton({
  label,
  children,
  onClick,
  disabled,
  pressed,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
