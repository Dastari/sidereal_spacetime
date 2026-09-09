import wayfarerTemplate from "./templates/wayfarer-r001.json";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Box,
  Layers,
  MousePointer2,
  Hand,
  Undo2,
  Redo2,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Trash2,
  Copy,
  Focus,
  Download,
  Save,
  Plus,
  PanelLeftClose,
  PanelRightClose,
  Search,
} from "lucide-react";
import {
  FLOOR_SHAPES,
  SERVICE_CHANNELS,
  stampTile,
  type LayoutDocument,
  type Point,
  type Shape,
  type ServiceChannel,
} from "../../../../../packages/content/src/ship-layout";
import type {
  PartCatalog,
  PartAsset,
} from "../../../../../packages/content/src/assembly";
import {
  onSegment,
  samePoint,
} from "../../../../../packages/sim/src/layout-geometry";
import {
  ModeTabs,
  PropertyField,
  EditorSection,
  ValidationList,
} from "../../../../../packages/ui/src/editor-controls";
import LayoutCanvas, { type Gesture, type Tool } from "./LayoutCanvas";
import { placeTiles, transformTiles, type ViewState } from "./state";
import { useLayout, uuid } from "./useLayout";
import "./layout.css";
import HullWorkspace from "./HullWorkspace";
import { assemblyMismatches } from "../../../../../packages/content/src/layout-assembly";
import {
  LayoutPalette,
  LayoutInspector,
  type LayoutPanelContext,
} from "./LayoutPanels";
const modes = ["Structure", "Rooms", "Objects", "Hull", "Systems"] as const;
const projections = ["Top", "Side", "Front", "3D"] as const;
const roomTypes = [
  "Bridge",
  "Crew quarters",
  "Galley",
  "Lounge",
  "Medbay",
  "Workshop",
  "Storage",
  "Utility",
  "Cargo",
  "Corridor",
  "Custom",
];
export default function LayoutEditor() {
  const editor = useLayout(),
    { doc, history, view, setView, result } = editor;
  const [selection, select] = useState<string[]>([]),
    [tool, setTool] = useState<Tool>("select"),
    [shape, setShape] = useState<Shape>("rectangle"),
    [turns, setTurns] = useState(0),
    [mirrorX, setMirrorX] = useState(false),
    [mirrorY, setMirrorY] = useState(false),
    [search, setSearch] = useState(""),
    [roomType, setRoomType] = useState("Lounge"),
    [channel, setChannel] = useState<ServiceChannel>("power"),
    [asset, setAsset] = useState<PartAsset>(),
    [catalog, setCatalog] = useState<PartCatalog>(),
    [catalogError, setCatalogError] = useState(""),
    [showLeft, toggleLeft] = useState(true),
    [showRight, toggleRight] = useState(true),
    [inspector, setInspector] = useState<"Inspector" | "Layers" | "Validation">(
      "Inspector",
    ),
    [newDialog, setNewDialog] = useState(false),
    [reuseNodes, setReuseNodes] = useState(false);
  const mismatches = catalog
    ? (doc?.fittings ?? []).filter((f) => {
        const definition = catalog.assets.find((a) => a.id === f.definitionId);
        return (
          !definition ||
          (definition.visual?.sha256 ?? "legacy-visual-reference") !==
            f.revision
        );
      })
    : [];
  const blocked =
    editor.blocked ||
    mismatches.length > 0 ||
    !!(doc && catalog && assemblyMismatches(doc, catalog).length);
  function commit(change: (d: LayoutDocument) => LayoutDocument) {
    if (blocked) return;
    editor.commit(change);
  }
  const input = useRef<HTMLInputElement>(null),
    shell = useRef<HTMLElement>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/assets/assembly/catalog.json")
      .then((r) => {
        if (!r.ok) throw new Error("Catalog unavailable");
        return r.json();
      })
      .then((c) => {
        if (cancelled) return;
        if (
          c.schema !== "sidereal.part-catalog.v1" ||
          !Array.isArray(c.assets) ||
          c.assets.some(
            (a: PartAsset) =>
              !a ||
              typeof a.id !== "string" ||
              typeof a.label !== "string" ||
              !Array.isArray(a.bounds?.min) ||
              !Array.isArray(a.bounds?.max) ||
              a.bounds.min.length !== 3 ||
              a.bounds.max.length !== 3 ||
              ![...a.bounds.min, ...a.bounds.max].every(Number.isFinite),
          )
        )
          throw new Error("Invalid part catalog");
        setCatalog(c);
      })
      .catch((e) => {
        if (!cancelled)
          setCatalogError(`${String(e)}. Metadata and draft remain available.`);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  function cancel() {
    setTool("select");
  }
  const selectedTile = doc?.tiles.find((t) => selection.includes(t.id)),
    selectedRoom = doc?.rooms.find((t) => selection.includes(t.id)),
    selectedPartition = doc?.partitions.find((t) => selection.includes(t.id)),
    selectedOpening = doc?.openings.find((t) => selection.includes(t.id)),
    selectedFitting = doc?.fittings.find((t) => selection.includes(t.id)),
    selectedRoute = doc?.routes.find((t) => selection.includes(t.id));
  function transform(
    action: "rotate" | "mirror-x" | "mirror-y" | "copy" | "move",
    delta: Point = [0, 0],
  ) {
    commit((d) => {
      const next = transformTiles(d, selection, action, delta, uuid);
      next.fittings = next.fittings.flatMap((f) => {
        if (!selection.includes(f.id)) return [f];
        const q = { ...f };
        if (action === "rotate") q.quarterTurns = (q.quarterTurns + 1) % 4;
        if (action === "mirror-x") q.reflected = !q.reflected;
        if (action === "mirror-y") {
          q.reflected = !q.reflected;
          q.quarterTurns = (q.quarterTurns + 2) % 4;
        }
        if (action === "move" || action === "copy")
          q.position = [q.position[0] + delta[0], q.position[1] + delta[1]];
        if (action === "copy") {
          q.id = uuid();
          return [f, q];
        }
        return [q];
      });
      return next;
    });
  }
  function remove() {
    commit((d) => {
      const removedPartitions = d.partitions
        .filter((p) => selection.includes(p.id))
        .map((p) => p.id);
      d.tiles = d.tiles.filter((t) => !selection.includes(t.id));
      d.partitions = d.partitions.filter((p) => !selection.includes(p.id));
      d.openings = d.openings.filter(
        (o) =>
          !selection.includes(o.id) &&
          !removedPartitions.includes(o.partitionId),
      );
      d.rooms = d.rooms
        .filter((r) => !selection.includes(r.id))
        .map((r) => ({
          ...r,
          boundaryIds: r.boundaryIds.filter(
            (id) => !removedPartitions.includes(id),
          ),
        }));
      d.fittings = d.fittings.filter((f) => !selection.includes(f.id));
      d.routes = d.routes.filter((r) => !selection.includes(r.id));
      const used = new Set(d.routes.flatMap((r) => [r.from, r.to]));
      d.nodes = d.nodes.filter((n) => used.has(n.id));
      d.decks = d.decks.map((deck) => ({
        ...deck,
        holes: deck.holes.filter((h) => !selection.includes(h.id)),
      }));
      return d;
    });
    select([]);
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"],dialog',
        ) ||
        newDialog
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      if (
        (view.mode === "Hull" ||
          (view.mode === "Objects" && view.projection !== "Top")) &&
        !(mod && ["s", "z", "y"].includes(e.key.toLowerCase()))
      )
        return;
      if (e.key === "Escape") {
        cancel();
        select([]);
        return;
      }
      if (document.querySelector('[data-gesture-active="true"]')) return;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        editor.save();
        return;
      }
      if (blocked) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? editor.redo() : editor.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        editor.redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove();
      } else if (e.key.toLowerCase() === "r") {
        selection.length ? transform("rotate") : setTurns((t) => (t + 1) % 4);
      } else if (e.key.toLowerCase() === "f") {
        transform(e.shiftKey ? "mirror-y" : "mirror-x");
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        transform("copy", [64, 0]);
      } else if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        transform("move", [
          e.key === "ArrowLeft"
            ? -view.grid
            : e.key === "ArrowRight"
              ? view.grid
              : 0,
          e.key === "ArrowDown"
            ? -view.grid
            : e.key === "ArrowUp"
              ? view.grid
              : 0,
        ]);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const updateView = (change: Partial<ViewState>) =>
    setView({ ...view, ...change });
  function mode(value: ViewState["mode"]) {
    updateView({
      mode: value,
      projection: value === "Hull" || value === "Objects" ? "3D" : "Top",
    });
    setTool("select");
    setSearch("");
    select([]);
  }
  function fit() {
    if (!result) return;
    updateView({
      camera: {
        x: (result.bounds.min[0] + result.bounds.max[0]) / 2,
        y: (result.bounds.min[1] + result.bounds.max[1]) / 2,
        scale: Math.max(
          0.025,
          Math.min(
            1.4,
            ((shell.current?.querySelector(".layout-canvas-wrap")
              ?.clientWidth ?? 800) -
              100) /
              Math.max(128, result.bounds.max[0] - result.bounds.min[0]),
            ((shell.current?.querySelector(".layout-canvas-wrap")
              ?.clientHeight ?? 600) -
              150) /
              Math.max(128, result.bounds.max[1] - result.bounds.min[1]),
          ),
        ),
      },
    });
  }
  function gesture(g: Gesture) {
    if (!doc) return;
    const deckId = view.deckId,
      shapeName = g.shape ?? shape;
    if (g.tool === "select") {
      const delta: Point = [g.end[0] - g.start[0], g.end[1] - g.start[1]];
      if (selectedRoom) {
        commit((d) => ({
          ...d,
          rooms: d.rooms.map((r) =>
            r.id === selectedRoom.id
              ? { ...r, seed: [r.seed[0] + delta[0], r.seed[1] + delta[1]] }
              : r,
          ),
        }));
      } else transform(g.copy ? "copy" : "move", delta);
      return;
    }
    if (g.tool === "stamp" || g.tool === "fill") {
      const at: Point[] = [];
      if (g.tool === "fill") {
        for (
          let x = Math.min(g.start[0], g.end[0]);
          x <= Math.max(g.start[0], g.end[0]) && at.length < 2049;
          x += 64
        )
          for (
            let y = Math.min(g.start[1], g.end[1]);
            y <= Math.max(g.start[1], g.end[1]) && at.length < 2049;
            y += 64
          )
            at.push([x, y]);
      } else at.push(g.end);
      commit((d) =>
        placeTiles(d, at, shapeName, deckId, turns, mirrorX, mirrorY, uuid),
      );
      return;
    }
    if (g.tool === "partition") {
      if (samePoint(g.start, g.end)) return;
      const id = uuid();
      commit((d) => ({
        ...d,
        partitions: [
          ...d.partitions,
          { id, deckId, a: g.start, b: g.end, seal: "design-sealed" },
        ],
      }));
      select([id]);
      return;
    }
    if (g.tool === "door") {
      const partition =
        doc.partitions.find((p) => p.id === g.entityId) ??
        doc.partitions.find(
          (p) => p.deckId === deckId && onSegment(g.end, p.a, p.b),
        );
      if (!partition) {
        editor.setError("Click an existing partition to reserve an opening.");
        return;
      }
      const axis = partition.a[0] === partition.b[0] ? 1 : 0,
        from = Math.max(
          Math.min(partition.a[axis], partition.b[axis]),
          Math.min(
            g.end[axis] - 16,
            Math.max(partition.a[axis], partition.b[axis]) - 32,
          ),
        );
      const a: Point = [...g.end],
        b: Point = [...g.end];
      a[axis] = from;
      b[axis] = from + 32;
      a[1 - axis] = partition.a[1 - axis];
      b[1 - axis] = partition.a[1 - axis];
      const id = uuid();
      commit((d) => ({
        ...d,
        openings: [
          ...d.openings,
          {
            id,
            deckId,
            partitionId: partition.id,
            a,
            b,
            kind: "door",
            clearance: 32,
            sill: 0,
          },
        ],
      }));
      select([id]);
      return;
    }
    if (g.tool === "room") {
      const id = uuid();
      commit((d) => ({
        ...d,
        rooms: [
          ...d.rooms,
          {
            id,
            deckId,
            name: roomType,
            type: roomType,
            seed: g.start,
            boundaryIds: [],
            access: "crew",
            floorTheme: "Unassigned",
            wallTheme: "Unassigned",
          },
        ],
      }));
      select([id]);
      setTool("select");
      return;
    }
    if (g.tool === "hole") {
      const id = uuid();
      commit((d) => ({
        ...d,
        decks: d.decks.map((deck) =>
          deck.id === deckId
            ? { ...deck, holes: [...deck.holes, { id, seed: g.start }] }
            : deck,
        ),
      }));
      select([id]);
      setTool("select");
      return;
    }
    if (g.tool === "route") {
      if (samePoint(g.start, g.end)) return;
      commit((d) => {
        const node = (p: Point, direction: "in" | "out") => {
          const existing = reuseNodes
            ? d.nodes.find(
                (n) =>
                  n.deckId === deckId &&
                  n.channel === channel &&
                  samePoint(n.point, p),
              )
            : undefined;
          if (existing) {
            existing.kind = "junction";
            existing.direction = "both";
            return existing.id;
          }
          const id = uuid();
          d.nodes.push({
            id,
            deckId,
            point: p,
            channel,
            kind: "endpoint",
            direction,
            medium: channel,
          });
          return id;
        };
        const from = node(g.start, "out"),
          to = node(g.end, "in"),
          path = [g.start, [g.end[0], g.start[1]] as Point, g.end].filter(
            (p, i, a) => i === 0 || !samePoint(p, a[i - 1]),
          );
        d.routes.push({
          id: uuid(),
          deckId,
          channel,
          from,
          to,
          path,
          capacity: null,
        });
        return d;
      });
      return;
    }
    if (g.tool === "object") {
      const selected = g.assetId
        ? catalog?.assets.find((a) => a.id === g.assetId)
        : asset;
      if (!selected) {
        editor.setError("Choose a catalog visual reference first.");
        return;
      }
      const id = uuid(),
        footprint: Point = [
          Math.max(
            16,
            Math.round((selected.bounds.max[0] - selected.bounds.min[0]) * 32),
          ),
          Math.max(
            16,
            Math.round((selected.bounds.max[1] - selected.bounds.min[1]) * 32),
          ),
        ],
        container = /crate|cargo|container/i.test(selected.label);
      commit((d) => ({
        ...d,
        fittings: [
          ...d.fittings,
          {
            id,
            deckId,
            definitionId: selected.id,
            revision: selected.visual?.sha256 ?? "legacy-visual-reference",
            position: g.end,
            quarterTurns: turns,
            reflected: false,
            footprint,
            clearance: 16,
            kind: container ? "container" : "equipment",
            container: container ? { columns: 4, rows: 3, contents: [] } : null,
          },
        ],
      }));
      select([id]);
    }
  }
  function resizePanel(side: "left" | "right", e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const start = e.clientX,
      width = side === "left" ? view.leftWidth : view.rightWidth;
    const move = (event: PointerEvent) =>
      setView((v) => ({
        ...v,
        [side === "left" ? "leftWidth" : "rightWidth"]: Math.max(
          200,
          Math.min(
            380,
            width + (event.clientX - start) * (side === "left" ? 1 : -1),
          ),
        ),
      }));
    const done = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", done);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", done);
  }
  const button = (
    label: string,
    Icon: typeof Box,
    onClick: () => void,
    disabled = false,
    active = false,
  ) => (
    <button
      title={label}
      aria-label={label}
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
    >
      <Icon size={17} />
    </button>
  );
  const changeSelected = (
    key: "rooms" | "partitions" | "openings" | "fittings" | "routes",
    change: Record<string, unknown>,
  ) =>
    commit((d) => ({
      ...d,
      [key]: d[key].map((x) =>
        selection.includes(x.id) ? { ...x, ...change } : x,
      ),
    }));
  const componentMode =
    view.mode === "Hull" ||
    (view.mode === "Objects" && view.projection !== "Top");
  const metrics = result
    ? {
        length: (result.bounds.max[0] - result.bounds.min[0]) / 32,
        width: (result.bounds.max[1] - result.bounds.min[1]) / 32,
      }
    : null;
  const errors =
    result?.diagnostics.filter((d) => d.severity === "error").length ?? 0;
  const panelContext: LayoutPanelContext = {
    editor,
    doc,
    result,
    view,
    blocked,
    showLeft,
    showRight,
    selection,
    select,
    updateView,
    commit,
    search,
    setSearch,
    shape,
    setShape,
    tool,
    setTool,
    roomType,
    setRoomType,
    channel,
    setChannel,
    reuseNodes,
    setReuseNodes,
    catalog,
    catalogError,
    asset,
    setAsset,
    inspector,
    setInspector,
    selectedTile,
    selectedRoom,
    selectedPartition,
    selectedOpening,
    selectedFitting,
    selectedRoute,
    changeSelected,
    turns,
    setTurns,
    mirrorX,
    setMirrorX,
    mirrorY,
    setMirrorY,
    metrics,
    errors,
    transform,
  };
  return (
    <main
      className="layout-editor"
      ref={shell}
      style={
        {
          "--layout-left": showLeft ? `${view.leftWidth}px` : "0px",
          "--layout-right": showRight ? `${view.rightWidth}px` : "0px",
        } as CSSProperties
      }
      data-layout-fingerprint={result?.fingerprint}
    >
      <header className="layout-document-bar">
        <div>
          <h1>Ship layout planner</h1>
          <span>
            {doc?.kind === "station-module" ? "Station module" : "Ship"} · Local
            design draft
          </span>
        </div>
        <input
          aria-label="Document name"
          value={doc?.name ?? "Preserved recovery"}
          disabled={blocked}
          onChange={(e) => commit((d) => ({ ...d, name: e.target.value }))}
        />
        <span className="layout-save-status" role="status">
          {editor.saved}
        </span>
        <div className="layout-document-actions">
          {button("Undo", Undo2, editor.undo, blocked || !history?.past.length)}
          {button(
            "Redo",
            Redo2,
            editor.redo,
            blocked || !history?.future.length,
          )}
          <button onClick={editor.save} disabled={blocked}>
            <Save size={15} /> Save draft
          </button>
          <button className="layout-primary" onClick={editor.exportDraft}>
            <Download size={15} /> Export
          </button>
          <button onClick={() => input.current?.click()}>Import</button>
          <button onClick={() => setNewDialog(true)}>
            <Plus size={16} /> New
          </button>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0])
                void editor.importFile(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </div>
      </header>
      <div className="layout-mode-bar">
        <ModeTabs
          label="Layout modes"
          values={modes}
          value={view.mode}
          onChange={mode}
        />
        <div className="layout-projection">
          <ModeTabs
            label="Projection"
            values={projections}
            value={view.projection}
            onChange={(projection) => {
              updateView({ projection });
              cancel();
            }}
          />
        </div>
      </div>
      {(editor.error || editor.recovery || editor.conflict) && (
        <div className="layout-alert" role="alert">
          <span>{editor.error}</span>
          {editor.recovery && (
            <>
              <button onClick={editor.exportDraft}>
                Export preserved import
              </button>
              {doc && (
                <button onClick={editor.resume}>Resume saved draft</button>
              )}
            </>
          )}
          {doc && <button onClick={editor.fork}>Fork current proposal</button>}
        </div>
      )}
      {mismatches.length > 0 && (
        <div className="layout-alert" role="alert">
          <span>
            {mismatches.length} visual catalog revisions are missing or changed.
            This draft is read-only; its placements are preserved.
          </span>
          <button onClick={editor.exportDraft}>Export preserved draft</button>
        </div>
      )}
      {editor.legacy && !doc?.legacy && (
        <div className="layout-legacy">
          <span>
            Assembly-v1 draft found. Original data and history are preserved.
          </span>
          <button onClick={editor.migrate}>Migrate as visual references</button>
          <button onClick={editor.exportLegacy}>Export original</button>
          <a href="/shipyard?assembly=legacy">Open assembly editor</a>
        </div>
      )}
      {(view.mode === "Hull" ||
        (view.mode === "Objects" && view.projection !== "Top")) &&
      doc ? (
        <HullWorkspace
          mode={view.mode === "Objects" ? "Objects" : "Hull"}
          doc={doc}
          catalog={catalog}
          catalogError={catalogError}
          blocked={blocked}
          result={result}
          projection={view.projection}
          deckId={view.deckId}
          commit={commit}
          adopt={(d) => editor.adopt(d, false, true)}
          error={editor.setError}
        />
      ) : (
        <div
          className={`layout-workspace ${showLeft ? "" : "left-closed"} ${showRight ? "" : "right-closed"}`}
        >
          <LayoutPalette {...panelContext} />
          <div
            className="layout-resizer left"
            role="separator"
            aria-label="Resize palette"
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={(e) => resizePanel("left", e)}
            onKeyDown={(e) => {
              if (e.key.startsWith("Arrow"))
                updateView({
                  leftWidth: Math.max(
                    200,
                    Math.min(
                      380,
                      view.leftWidth + (e.key === "ArrowRight" ? 16 : -16),
                    ),
                  ),
                });
            }}
          />
          <section className="layout-center">
            <div className="layout-toolbar">
              {button("Toggle palette", PanelLeftClose, () => {
                toggleLeft((v) => !v);
                if (window.innerWidth < 1100) toggleRight(false);
              })}
              {button(
                "Select (click / Shift-click / box)",
                MousePointer2,
                () => setTool("select"),
                false,
                tool === "select",
              )}
              {button(
                "Pan (middle drag or Space)",
                Hand,
                () => setTool("pan"),
                false,
                tool === "pan",
              )}
              <span className="layout-toolbar-divider" />
              {button(
                "Rotate 90° (R)",
                RotateCw,
                () =>
                  selection.length
                    ? transform("rotate")
                    : setTurns((t) => (t + 1) % 4),
                blocked,
              )}
              {button(
                "Mirror X (F)",
                FlipHorizontal,
                () => transform("mirror-x"),
                blocked || !selection.length,
              )}
              {button(
                "Mirror Y (Shift+F)",
                FlipVertical,
                () => transform("mirror-y"),
                blocked || !selection.length,
              )}
              {button(
                "Copy (Ctrl+D)",
                Copy,
                () => transform("copy", [64, 0]),
                blocked || !selection.length,
              )}
              {button(
                selectedPartition
                  ? "Delete partition and its openings"
                  : "Delete selection",
                Trash2,
                remove,
                blocked || !selection.length,
              )}
              <span className="layout-toolbar-divider" />
              {button("Fit floorplan", Focus, fit)}
              <button
                onClick={() =>
                  updateView({
                    camera: {
                      ...view.camera,
                      scale: Math.max(0.025, view.camera.scale / 1.2),
                    },
                  })
                }
                aria-label="Zoom out"
              >
                −
              </button>
              <span className="layout-zoom">
                {Math.round(view.camera.scale * 100)}%
              </span>
              <button
                onClick={() =>
                  updateView({
                    camera: {
                      ...view.camera,
                      scale: Math.min(6, view.camera.scale * 1.2),
                    },
                  })
                }
                aria-label="Zoom in"
              >
                +
              </button>
              {button("Toggle inspector", PanelRightClose, () => {
                toggleRight((v) => !v);
                if (window.innerWidth < 1100) toggleLeft(false);
              })}
            </div>
            {doc ? (
              <LayoutCanvas
                actions={{
                  copy: () => transform("copy", [64, 0]),
                  rotate: () => transform("rotate"),
                  remove,
                }}
                catalog={catalog}
                doc={doc}
                result={result}
                view={view}
                setView={setView}
                selection={selection}
                select={select}
                tool={tool}
                shape={shape}
                turns={turns}
                blocked={blocked}
                gesture={gesture}
                cancel={cancel}
                channel={channel}
              />
            ) : (
              <div className="layout-recovery">
                <h2>Draft recovery</h2>
                <p>
                  The saved document could not be opened. Its original bytes
                  have not been changed.
                </p>
                <button className="layout-primary" onClick={editor.exportDraft}>
                  Export preserved data
                </button>
                <button onClick={() => setNewDialog(true)}>
                  Create a separate draft
                </button>
              </div>
            )}
          </section>
          <div
            className="layout-resizer right"
            role="separator"
            aria-label="Resize inspector"
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={(e) => resizePanel("right", e)}
            onKeyDown={(e) => {
              if (e.key.startsWith("Arrow"))
                updateView({
                  rightWidth: Math.max(
                    200,
                    Math.min(
                      380,
                      view.rightWidth + (e.key === "ArrowLeft" ? 16 : -16),
                    ),
                  ),
                });
            }}
          />
          <LayoutInspector {...panelContext} />
        </div>
      )}
      <footer className="layout-statusbar">
        <span>
          {doc?.name ?? "Recovery"} <b>Local draft</b>
        </span>
        <span>
          {componentMode ? (
            "3D components · Ctrl/Cmd-C copies · Ctrl/Cmd-V pastes"
          ) : (
            <>
              {view.grid / 32} m snap ·{" "}
              {tool === "select"
                ? "Click selects · Shift extends · drag moves"
                : tool === "partition"
                  ? "Drag along shared tile edges"
                  : tool === "room"
                    ? "Click inside a tile to name its region"
                    : tool === "route"
                      ? "Drag to route · explicit endpoints only"
                      : tool === "stamp"
                        ? "Click or drag a palette tile to place"
                        : tool === "door"
                          ? "Click a partition to reserve an opening"
                          : tool === "fill"
                            ? "Drag to stamp a bounded area"
                            : tool === "hole"
                              ? "Click inside an enclosed empty void"
                              : tool === "object"
                                ? "Click to place the selected visual reference"
                                : "Middle drag / Space to pan"}
            </>
          )}
        </span>
        <button
          onClick={() => {
            if (componentMode) return;
            setInspector("Validation");
            toggleRight(true);
          }}
        >
          {componentMode ? (
            `${(doc?.assembly?.parts.length ?? 0) + (doc?.fittings.length ?? 0)} visual components`
          ) : (
            <>
              {editor.busy ? "Validating…" : `${errors} errors`} ·{" "}
              {doc?.tiles.length ?? 0} tiles
            </>
          )}
        </button>
        <button
          onClick={() =>
            updateView({ projection: view.projection === "3D" ? "Top" : "3D" })
          }
        >
          <Box size={15} />{" "}
          {view.projection === "3D" ? "Floorplan" : "3D preview"}
        </button>
      </footer>
      {newDialog && (
        <dialog
          open
          className="layout-dialog"
          aria-label="Create a separate layout"
        >
          <h2>New local layout</h2>
          <p>
            Your current saved draft stays in browser recovery storage. Export
            any unsaved or conflicting proposal first.
          </p>
          <button
            onClick={() => {
              editor.create("ship");
              setNewDialog(false);
              select([]);
            }}
          >
            Empty ship
          </button>
          <button
            onClick={() => {
              editor.create("station-module");
              setNewDialog(false);
              select([]);
            }}
          >
            Empty station module
          </button>
          <button
            disabled={editor.blocked}
            title={
              editor.blocked
                ? "Resolve or export the current recovery/conflict first"
                : "Create a separate editable copy of the pinned native Wayfarer"
            }
            onClick={() => {
              if (editor.createFromWayfarer(wayfarerTemplate)) {
                setNewDialog(false);
                select([]);
              }
            }}
          >
            Wayfarer template · current native layout
          </button>
          <p>
            One authored deck with the current cockpit, floors, roof and
            objects. Creates a local draft; changes need fresh gameplay
            qualification.
          </p>
          <button
            onClick={() => {
              editor.create("ship", true);
              setNewDialog(false);
              select([]);
            }}
          >
            Pathfinder sample
          </button>
          <button onClick={() => setNewDialog(false)}>Cancel</button>
          <h3>Saved local drafts</h3>
          <div className="layout-saved-drafts">
            {editor.savedDrafts().map((d) => (
              <button
                key={d.key}
                onClick={() => {
                  editor.openSaved(d.key);
                  setNewDialog(false);
                  select([]);
                }}
              >
                {d.name}
              </button>
            ))}
          </div>
        </dialog>
      )}
    </main>
  );
}
