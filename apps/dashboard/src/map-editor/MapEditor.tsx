import { waitForLiveMap } from "./live-map-save";
import { LiveGenesis } from "../planet-studio/LiveGenesis";
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
  RefreshCw,
  Square,
  Circle,
  Pentagon,
  X,
  Settings2,
} from "lucide-react";
import { MapToolButton as IconButton } from "./MapToolButton";
import { MapContextMenu, type MapMenuAction } from "./MapContextMenu";
import { appendAnchor, drawnBoundary } from "./map-drawing";
import type { ZoneAnchor } from "@sidereal/content/zones";
import UniverseTree from "./UniverseTree";
import { editorCommand, editorKeyTarget } from "@sidereal/ui/editor-commands";
import { newMapZone } from "@sidereal/content/zones";
import { splitZoneEdge, setZoneHandle } from "@sidereal/sim/zone-path";
import {
  mapZones,
  moveMapSelection,
  duplicateMapSelection,
  deleteMapSelection,
  reparentMapObject,
} from "./map-commands";
import { GenericZoneInspector } from "./ZoneProperties";
import { systemCenter } from "@sidereal/sim/space-background";
import { useMemo, useState, useEffect, useRef } from "react";
import {
  MAP_WORKSPACE,
  newSystemMap,
  newAsteroidField,
  type SystemMapDocument,
  type AsteroidField,
} from "@sidereal/content/system-map";
import {
  validateSystemMap,
  generateMapFields,
  readSystemMap,
  fieldVolume,
} from "@sidereal/sim/system-map";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { useMapConnection } from "./useMapConnection";
import MapCanvas, { type Camera } from "./MapCanvas";
import MapInspector from "./MapInspector";
import "./map-editor.css";
interface Draft {
  doc: SystemMapDocument;
  revision: string;
  fingerprint: string;
  past: SystemMapDocument[];
  future: SystemMapDocument[];
  editGroup?: string;
}
type LiveMap = {
  id: string;
  revision: bigint;
  sourceFingerprint: string;
  documentJson: string;
};
const initial = (row: LiveMap): Draft => ({
  doc: readSystemMap(row.documentJson),
  revision: row.revision.toString(),
  fingerprint: row.sourceFingerprint,
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
export default function MapEditor({ genesis = false }: { genesis?: boolean }) {
  const live = useMapConnection();
  const rows = live.connection
    ? [...live.connection.db.ownSystemMaps.iter()]
    : [];
  const requested = new URLSearchParams(location.search).get("body");
  const row =
    rows.find(
      (r) =>
        requested &&
        JSON.parse(r.documentJson).bodies.some(
          (b: { id: string }) => b.id === requested,
        ),
    ) ?? rows[0];
  if (!live.user || live.status !== "ready" || !row)
    return (
      <main className="map-live-gate">
        <h1>{genesis ? "Genesis" : "Universe"}</h1>
        <p role="status">
          {live.status === "ready"
            ? "Universe-map read access is required to open a live system."
            : "Connecting to the live world…"}
        </p>
        {live.error && <p role="alert">{live.error}</p>}
      </main>
    );
  return (
    <SystemMapWorkspace
      key={live.user.profile.sub}
      live={live}
      initialRow={row}
      genesis={genesis}
    />
  );
}
export function SystemMapWorkspace({
  live,
  initialRow,
  genesis = false,
}: {
  live: ReturnType<typeof useMapConnection>;
  initialRow: LiveMap;
  genesis?: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(() => initial(initialRow)),
    [selection, setSelection] = useState<string[]>(() => {
      const id = new URLSearchParams(location.search).get("body");
      return id &&
        readSystemMap(initialRow.documentJson).bodies.some((b) => b.id === id)
        ? [id]
        : [];
    }),
    [tool, setTool] = useState<"select" | "direct" | "pan">("select"),
    [pointIndex, setPointIndex] = useState<number | null>(null),
    [cancelToken, setCancelToken] = useState(0),
    [camera, setCamera] = useState<Camera>(() =>
      fit(readSystemMap(initialRow.documentJson)),
    ),
    [drawing, setDrawing] = useState<ZoneAnchor[] | null>(null),
    [creation, setCreation] = useState<{
      kind: "zone" | "field";
      shape: "box" | "ellipsoid" | "polygon";
      parentId: string;
    } | null>(null),
    [drawFuture, setDrawFuture] = useState<ZoneAnchor[]>([]),
    [layers, setLayers] = useState({
      bodies: true,
      ships: true,
      fields: true,
      grid: true,
      orbits: true,
    }),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState("");
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    id: string | null;
    point: number | null;
  } | null>(null);
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
  const doc = draft.doc;
  const edit = (update: (d: SystemMapDocument) => void) => {
    if (!writable || live.status !== "ready" || busy) {
      setError(
        "Write access and an active connection are required to edit this system.",
      );
      return;
    }
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
      !active ||
      busy ||
      (active.revision.toString() === draft.revision &&
        active.sourceFingerprint === draft.fingerprint)
    )
      return;
    if (draft.past.length) {
      setError(
        "The live system changed while you were editing. Reload the live map before applying changes.",
      );
      return;
    }
    setDraft(initial(active));
  }, [
    active?.revision,
    active?.sourceFingerprint,
    busy,
    draft.revision,
    draft.fingerprint,
    draft.past.length,
  ]);
  const save = () => void apply();
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
      // Reducer completion and subscription delivery can arrive separately.
      // Keep retry identity and disable edits until the authoritative view arrives.
      const table = live.connection.db.ownSystemMaps;
      const row = await waitForLiveMap(
        () => table.id.find(doc.id),
        (inspect) => {
          table.onInsert(inspect);
          table.onUpdate(inspect);
          return () => {
            table.removeOnInsert(inspect);
            table.removeOnUpdate(inspect);
          };
        },
        BigInt(draft.revision),
      );
      setDraft(initial(row));
      setSaved("Applied to world");
      pending.current = null;
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const beginDraw = (
    kind: "zone" | "field",
    shape: "box" | "ellipsoid" | "polygon",
  ) => {
    if (!writable || busy) return;
    setCreation({
      kind,
      shape,
      parentId: mapZones(doc).some((z) => z.id === selected)
        ? selected
        : doc.id,
    });
    setDrawing(shape === "polygon" ? [] : null);
    setDrawFuture([]);
    setLayers((old) => ({ ...old, fields: true }));
    setTool("select");
  };
  const createBounds = (
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => {
    if (!creation || creation.shape === "polygon") return;
    if (!writable || live.status !== "ready" || busy) {
      setError(
        "Reconnect with write access to finish this boundary. Your unfinished path is retained.",
      );
      return;
    }

    const z =
      creation.kind === "field"
        ? newAsteroidField(`field-${crypto.randomUUID()}`)
        : newMapZone(`zone-${crypto.randomUUID()}`);
    const parent = mapZones(doc).find((z) => z.id === creation.parentId);
    Object.assign(z, {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      width: Math.max(1, Math.abs(a.x - b.x)),
      length: Math.max(1, Math.abs(a.y - b.y)),
      shape: creation.shape,
      parentId: creation.parentId,
      height: parent?.height ?? 0,
      depth: parent?.depth ?? 500,
    });
    if ("density" in z)
      z.density = Math.min(
        z.density as number,
        128e9 / Math.max(1, fieldVolume(z as AsteroidField)),
      );
    edit((d) => {
      if ("density" in z) d.fields.push(z as AsteroidField);
      else (d.zones ??= []).push(z);
    });
    setSelected(z.id);
    setCreation(null);
  };
  const finish = () => {
    if (!drawing || drawing.length < 3) return;
    if (!writable || live.status !== "ready" || busy) {
      setError(
        "Reconnect with write access to finish this boundary. Your unfinished path is retained.",
      );
      return;
    }

    const f =
      creation?.kind === "field"
        ? newAsteroidField(`field-${crypto.randomUUID()}`)
        : newMapZone(`zone-${crypto.randomUUID()}`);
    f.parentId = creation?.parentId ?? doc.id;
    const parent = mapZones(doc).find((z) => z.id === f.parentId);
    f.height = parent?.height ?? 0;
    f.depth = parent?.depth ?? 500;
    f.shape = "polygon";
    try {
      Object.assign(f, drawnBoundary(drawing));
    } catch (e) {
      setError(String(e));
      return;
    }
    try {
      if ("density" in f)
        f.density = Math.min(
          f.density as number,
          128e9 / Math.max(1, fieldVolume(f as AsteroidField)),
        );
    } catch (e) {
      setError(String(e));
      return;
    }
    const candidate = clone(doc);
    if ("density" in f) candidate.fields.push(f as AsteroidField);
    else (candidate.zones ??= []).push(f);
    try {
      validateSystemMap(candidate);
    } catch (e) {
      setError(`Boundary needs adjustment: ${String(e)}`);
      return;
    }
    edit((d) => Object.assign(d, candidate));
    setTool("direct");
    setSelected(f.id);
    setDrawing(null);
    setCreation(null);
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
      setError("Live ships and celestial instances cannot be deleted here.");
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
  const frame = (id: string) => {
    if (id === doc.id) {
      setCamera(fit(doc));
      return;
    }
    const body = doc.bodies.find((b) => b.id === id),
      zone = mapZones(doc).find((z) => z.id === id),
      target = body ?? zone ?? ships.find((s) => s.shipId === id);
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
  };
  const openMenu = (
    x: number,
    y: number,
    id: string | null,
    point: number | null = null,
  ) => {
    if (creation) return;
    if (id && !selection.includes(id)) setSelected(id);
    setPointIndex(point);
    setMenu({ x, y, id, point });
  };
  const reparent = (id: string, parentId: string) => {
    if (!writable || busy) return;
    try {
      const next = clone(doc);
      reparentMapObject(next, id, parentId);
      validateSystemMap(next);
      edit((d) => Object.assign(d, next));
      setSelected(id);
    } catch (e) {
      setError(String(e));
    }
  };
  const menuZone = menu?.id
    ? mapZones(doc).find((z) => z.id === menu.id)
    : undefined;
  const menuPoint = menu?.point ?? null;
  const actions: MapMenuAction[] = menu?.id
    ? [
        { label: "Frame selection", action: () => frame(menu.id!) },
        {
          label: "Rename",
          disabled:
            !writable ||
            busy ||
            (!menuZone &&
              !doc.bodies.some((b) => b.id === menu.id) &&
              menu.id !== doc.id),
          action: () => {
            setSelected(menu.id!);
            requestAnimationFrame(() => {
              const input = document.querySelector<HTMLInputElement>(
                '.map-inspector-identity input[aria-label="Name"]',
              );
              input?.focus();
              input?.select();
            });
          },
        },
        ...(menuZone
          ? [
              {
                label: "Edit boundary points",
                action: () => {
                  setSelected(menuZone.id);
                  setTool("direct");
                },
              },
              {
                label: "Duplicate zone",
                disabled: !writable || busy,
                action: duplicate,
              },
              {
                label: "Delete zone",
                disabled: !writable || busy,
                action: () => remove(true),
              },
            ]
          : []),
        ...(menuZone?.shape === "polygon" && menuPoint !== null
          ? [
              {
                label: "Make point smooth",
                disabled: !writable || busy,
                action: () =>
                  edit((d) => {
                    const v = mapZones(d).find(
                        (z) => z.id === menuZone.id,
                      )!.vertices,
                      i = menuPoint,
                      a = v[i],
                      before = v[(i + v.length - 1) % v.length],
                      after = v[(i + 1) % v.length];
                    a.mode = "mirrored";
                    setZoneHandle(a, "out", {
                      x: (after.x - before.x) / 6,
                      y: (after.y - before.y) / 6,
                    });
                  }),
              },
              {
                label: "Make point a corner",
                disabled: !writable || busy,
                action: () =>
                  edit((d) => {
                    const a = mapZones(d).find((z) => z.id === menuZone.id)!
                      .vertices[menuPoint];
                    delete a.in;
                    delete a.out;
                    a.mode = "corner";
                  }),
              },
              {
                label: "Insert point after",
                disabled: !writable || busy || menuZone.vertices.length >= 64,
                action: () => {
                  edit((d) =>
                    splitZoneEdge(
                      mapZones(d).find((z) => z.id === menuZone.id)!.vertices,
                      menuPoint,
                    ),
                  );
                  setPointIndex(menuPoint + 1);
                },
              },
              {
                label: "Delete point",
                disabled: !writable || busy || menuZone.vertices.length <= 3,
                action: () => {
                  edit((d) =>
                    mapZones(d)
                      .find((z) => z.id === menuZone.id)!
                      .vertices.splice(menuPoint, 1),
                  );
                  setPointIndex(null);
                },
              },
            ]
          : []),
        { label: "Deselect", action: () => setSelected("") },
      ]
    : [
        {
          label: "Draw polygon / curve zone",
          disabled: !writable || busy,
          action: () => beginDraw("zone", "polygon"),
        },
        {
          label: "Draw polygon / curve field",
          disabled: !writable || busy,
          action: () => beginDraw("field", "polygon"),
        },
        {
          label: "Draw box zone",
          disabled: !writable || busy,
          action: () => beginDraw("zone", "box"),
        },
        {
          label: "Draw ellipse zone",
          disabled: !writable || busy,
          action: () => beginDraw("zone", "ellipsoid"),
        },
        {
          label: "Draw ellipse field",
          disabled: !writable || busy,
          action: () => beginDraw("field", "ellipsoid"),
        },
        {
          label: "Draw box field",
          disabled: !writable || busy,
          action: () => beginDraw("field", "box"),
        },
        { label: "Fit system", action: () => setCamera(fit(doc)) },
      ];
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
        if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
          e.preventDefault();
          const r = (e.target as Element).getBoundingClientRect();
          openMenu(r.left + 20, r.top + 20, selected || null, pointIndex);
          return;
        }
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
          setCreation(null);
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
          setCreation(null);
          return;
        }
        if (command === "draw") {
          beginDraw("zone", "polygon");
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
      {menu && (
        <MapContextMenu
          x={menu.x}
          y={menu.y}
          actions={actions}
          onClose={() => setMenu(null)}
        />
      )}
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
            <div
              className="map-tool-group"
              role="group"
              aria-label="Document and history"
            >
              <IconButton
                label="Undo (Ctrl+Z)"
                disabled={
                  !(drawing ? drawing.length : draft.past.length) || busy
                }
                onClick={() => {
                  if (drawing) {
                    const last = drawing.at(-1);
                    if (last) {
                      setDrawing(drawing.slice(0, -1));
                      setDrawFuture((old) => [...old, last]);
                    }
                  } else undo();
                }}
              >
                <Undo2 />
              </IconButton>
              <IconButton
                label="Redo (Ctrl+Shift+Z)"
                disabled={
                  !(drawing ? drawFuture.length : draft.future.length) || busy
                }
                onClick={() => {
                  if (drawing) {
                    const next = drawFuture.at(-1);
                    if (next) {
                      setDrawing([...drawing, next]);
                      setDrawFuture(drawFuture.slice(0, -1));
                    }
                  } else undo(true);
                }}
              >
                <Redo2 />
              </IconButton>
              <IconButton
                label="New system"
                disabled={busy || !writable}
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
              <IconButton
                label="Save to world (Ctrl+S)"
                disabled={!writable || busy || !!preview.error}
                onClick={save}
              >
                <Save />
              </IconButton>
              <IconButton
                label="Reload live map"
                disabled={!active || busy}
                onClick={() => load(doc.id)}
              >
                <RefreshCw />
              </IconButton>
            </div>
            <div
              className="map-tool-group"
              role="group"
              aria-label="Selection tools"
            >
              <IconButton
                label="Select (V)"
                help="Select and move objects. Shift-click adds to the selection."
                pressed={tool === "select" && !creation}
                onClick={() => {
                  setTool("select");
                  setDrawing(null);
                  setCreation(null);
                }}
              >
                <MousePointer2 />
              </IconButton>
              <IconButton
                label="Points (A)"
                help="Drag points and curve handles. Double-click an edge to add a point; Alt-drag breaks paired handles."
                pressed={tool === "direct" && !drawing}
                onClick={() => {
                  setTool("direct");
                  setDrawing(null);
                  setCreation(null);
                }}
              >
                <Spline />
              </IconButton>
              <IconButton
                label="Pan (H)"
                help="Drag the map. Space-drag or right-drag temporarily pans."
                pressed={tool === "pan" && !drawing}
                onClick={() => {
                  setTool("pan");
                  setDrawing(null);
                  setCreation(null);
                }}
              >
                <Hand />
              </IconButton>
              <IconButton
                label="Deselect (Esc)"
                disabled={!selection.length && !creation}
                onClick={() => {
                  setSelected("");
                  setDrawing(null);
                  setCreation(null);
                  setCancelToken((n) => n + 1);
                }}
              >
                <X />
              </IconButton>
              <IconButton
                label="Duplicate (Ctrl+D)"
                disabled={!writable || busy || !selection.length || !!creation}
                onClick={duplicate}
              >
                <Copy />
              </IconButton>
              <IconButton
                label="Delete selection"
                disabled={!writable || busy || !selection.length || !!creation}
                onClick={() => remove(true)}
              >
                <Trash2 />
              </IconButton>
            </div>
            <div
              className="map-tool-group"
              role="group"
              aria-label="View controls"
            >
              <IconButton
                label="Fit system"
                onClick={() => setCamera(fit(doc))}
              >
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
            </div>
            <div
              className="map-tool-group"
              role="group"
              aria-label="Drawing tools"
            >
              <IconButton
                label="Draw box zone"
                help="Drag opposite corners in the current view."
                disabled={!writable || busy}
                pressed={creation?.kind === "zone" && creation.shape === "box"}
                onClick={() => {
                  beginDraw("zone", "box");
                }}
              >
                <Square />
              </IconButton>
              <IconButton
                label="Draw polygon / curve zone (P)"
                help="Click corners; drag to curve. Click the first point or press Enter to close."
                disabled={!writable || busy}
                pressed={!!drawing}
                onClick={() => {
                  beginDraw("zone", "polygon");
                }}
              >
                <Pentagon />
              </IconButton>
              <IconButton
                label="More drawing tools"
                help="Choose ellipse, box or curved asteroid fields and zones."
                disabled={!writable || busy}
                onClick={() => {
                  const r = document.activeElement?.getBoundingClientRect();
                  openMenu(r?.left ?? 20, r?.bottom ?? 180, null);
                }}
              >
                <Circle />
              </IconButton>
            </div>
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
            writable={writable && !creation}
            onReparent={reparent}
            onContextMenu={(x, y, id) => openMenu(x, y, id)}
            onDropError={setError}
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
          </details>
        </aside>
        <div className="map-stage">
          {creation && !drawing && (
            <div className="map-draw-toolbar">
              <span>
                Drag to draw {creation.shape} {creation.kind}
              </span>
              <button onClick={() => setCreation(null)}>Cancel drawing</button>
            </div>
          )}
          {drawing && (
            <div className="map-draw-toolbar">
              <span>
                Click corners · drag curves · click first point to close ·{" "}
                {drawing.length}/64 points
              </span>
              <button disabled={drawing.length < 3} onClick={finish}>
                Finish zone
              </button>
              <button
                onClick={() => {
                  setDrawing(null);
                  setCreation(null);
                }}
              >
                Cancel
              </button>
            </div>
          )}
          {genesis ? (
            <LiveGenesis body={doc.bodies.find((b) => b.id === selected)} />
          ) : (
            <MapCanvas
              doc={doc}
              onContextMenu={openMenu}
              onFinishDraw={finish}
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
              creationShape={
                creation?.shape === "polygon" ? null : (creation?.shape ?? null)
              }
              onCreateBounds={createBounds}
              drawing={drawing}
              onDraw={(p) => {
                try {
                  setDrawing(
                    appendAnchor(drawing ?? [], p, camera.span / 100000),
                  );
                  setDrawFuture([]);
                } catch (e) {
                  setError(String(e));
                }
              }}
            />
          )}
          <footer className={preview.error ? "map-error" : "map-summary"}>
            {preview.error ||
              (saved === "Unsaved changes"
                ? "Pending changes"
                : saved || `${doc.bodies.length} celestial bodies`)}
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
