import { WallFitNotes } from "./WallFitNotes";
import { mountEditorCanvas } from "../../editor/mountEditorCanvas";
import { useEditorPanels } from "../../editor/useEditorPanels";
import { layoutNativeFloors } from "@sidereal/render/layout-native-floors";
import { PINNED_FLOOR_KIT } from "@sidereal/sim/construction-transactions";
import {
  Box,
  Copy,
  FlipHorizontal,
  Focus,
  Move,
  Orbit,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  PART_CATEGORIES,
  type PartCatalog,
  type PartCategory,
  type PartPlacement,
} from "@sidereal/content/assembly";
import {
  assemblyMismatches,
  editVisualPart,
  importShipAssembly,
  layoutVisualParts,
  visualRevision,
} from "@sidereal/content/layout-assembly";
import type { LayoutDocument } from "@sidereal/content/ship-layout";
import type {
  HullCameraState,
  HullViewState,
} from "@sidereal/render/layout-hull";
import type { CompiledLayout } from "@sidereal/sim/layout-compiler";
import { HullDecalPanel } from "../HullDecalPanel";
import { ShipSummary } from "./ShipSummary";
import { ViewportDeckControl } from "./ViewportDeckControl";
import "./hull.css";
import type { ViewState } from "./state";
import { uuid } from "./useLayout";
import type { SharedLayoutViewport } from "./viewport-state";
import "./workbench.css";
type Handle = ReturnType<
  (typeof import("@sidereal/render/layout-hull"))["createHullViewport"]
>;
interface Props {
  onDeckChange: (id: string) => void;
  sharedViewport?: RefObject<SharedLayoutViewport>;
  layers?: ViewState["layers"];
  onLayersChange?: (layers: ViewState["layers"]) => void;
  grid?: number;
  onGridChange?: (value: number) => void;
  initialSelection?: string;
  initialRoofVisible?: boolean;
  mode: "Hull" | "Objects";
  doc: LayoutDocument;
  catalog?: PartCatalog;
  catalogError: string;
  blocked: boolean;
  result?: CompiledLayout;
  projection: string;
  deckId: string;
  commit: (change: (d: LayoutDocument) => LayoutDocument) => void;
  adopt: (d: LayoutDocument) => void;
  error: (s: string) => void;
}
export default function HullWorkspace(props: Props) {
  const { doc, catalog, commit } = props;
  const {
    left: showLibrary,
    right: showInspector,
    setLeft: setShowLibrary,
    setRight: setShowInspector,
  } = useEditorPanels();
  const [wallNotes, setWallNotes] = useState<string[]>([]);
  const [inspectorTab, setInspectorTab] = useState("Properties");
  const [selection, select] = useState(props.initialSelection ?? ""),
    [assetId, setAsset] = useState(""),
    [tool, setTool] = useState<HullViewState["tool"]>("select"),
    [category, setCategory] = useState<PartCategory | "all">(
      props.mode === "Objects" ? "equipment" : "superstructure",
    ),
    [search, setSearch] = useState(""),
    [height, setHeight] = useState(0),
    [snap, setSnap] = useState(props.grid ?? 1),
    [status, setStatus] = useState("Loading workbench…"),
    [visible, setVisible] = useState(
      new Set<PartCategory>(
        PART_CATEGORIES.filter(
          (category) =>
            props.initialRoofVisible !== false || category !== "roof",
        ),
      ),
    ),
    [library, setLibrary] = useState<"current" | "all">("current");
  const categoryLayer: Record<PartCategory, keyof ViewState["layers"]> = {
    floor: "floor",
    wall: "walls",
    roof: "roof",
    superstructure: "exteriorHull",
    engine: "exteriorHull",
    equipment: "objects",
    cargo: "objects",
    decoration: "objects",
  };
  useEffect(() => {
    if (props.layers)
      setVisible(
        new Set(
          PART_CATEGORIES.filter(
            (c) => props.layers?.[categoryLayer[c]] !== false,
          ),
        ),
      );
  }, [props.mode]);
  const canvasHost = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement | null>(null),
    viewport = useRef<Handle | null>(null),
    latest = useRef(props),
    camera = useRef<HullCameraState | undefined>(
      props.sharedViewport?.current.documentId === doc.id
        ? props.sharedViewport.current.camera
        : undefined,
    ),
    lastDoc = useRef(doc.id);
  latest.current = props;
  const clipboard = useRef<{
    part: PartPlacement;
    fitting?: LayoutDocument["fittings"][number];
    count: number;
  } | null>(null);
  const [copiedLabel, setCopiedLabel] = useState("");
  useEffect(() => {
    if (props.grid !== undefined) setSnap(props.grid);
  }, [props.grid]);
  useEffect(() => {
    setCategory(props.mode === "Objects" ? "equipment" : "superstructure");
    setSearch("");
  }, [props.mode]);

  const parts = catalog ? layoutVisualParts(doc, catalog) : [],
    selected = parts.find((p) => p.id === selection),
    asset = catalog?.assets.find((a) => a.id === assetId),
    selectedAsset = catalog?.assets.find((a) => a.id === selected?.assetId),
    fitting = doc.fittings.some((f) => f.id === selection);
  const mismatches = catalog ? assemblyMismatches(doc, catalog) : [];
  const blocked = props.blocked || !catalog || mismatches.length > 0;
  const callback = useRef({
    move: (_id: string, _p: [number, number, number], _copy: boolean) => {},
    place: (_id: string, _p: [number, number, number]) => {},
  });
  const nativeFloors = useMemo(
    () =>
      catalog
        ? layoutNativeFloors(doc, catalog, props.deckId, visible.has("floor"))
        : { parts: [], unmatched: [] },
    [doc, catalog, props.deckId, visible],
  );
  const structural = (id: string) => {
    const category = catalog?.assets.find((a) => a.id === id)?.category;
    return category === "floor" || category === "wall" || category === "roof";
  };
  const contextOnly = new Set([
    ...nativeFloors.parts.map((p) => p.id),
    ...parts.filter((p) => structural(p.assetId)).map((p) => p.id),
  ]);
  const previewParts = [...parts, ...nativeFloors.parts];
  const unmatched = new Set(nativeFloors.unmatched);
  const floorGuide = props.result
    ? {
        ...props.result,
        fingerprint: `${props.result.fingerprint}:${props.deckId}:${visible.has("floor")}:${nativeFloors.unmatched.join(",")}`,
        tiles: props.result.tiles.filter(
          (t) => t.deckId === props.deckId && unmatched.has(t.id),
        ),
      }
    : undefined;
  useEffect(() => {
    setHeight(
      ((doc.decks.find((d) => d.id === props.deckId)?.elevation ?? 0) +
        (props.mode === "Objects" ? PINNED_FLOOR_KIT.datums.floorTop : 0)) /
        32,
    );
  }, [props.deckId, props.mode]);
  const state = useRef<HullViewState>({
    parts: previewParts,
    contextOnly,
    selected: selection,
    visible,
    tool,
    assetId,
    height,
    snap,
    blocked,
    projection: props.projection,
    showGrid: true,
    floor: floorGuide,
    suppressNativeWalls:
      !doc.structure &&
      parts.some(
        (p) =>
          catalog?.assets.find((a) => a.id === p.assetId)?.category === "wall",
      ),
    structuralGuide: props.result
      ? {
          walls: props.result.walls,
          deckId: props.deckId,
          elevationUnits:
            doc.decks.find((d) => d.id === props.deckId)?.elevation ?? 0,
          heightUnits:
            doc.decks.find((d) => d.id === props.deckId)?.ceiling ?? 96,
        }
      : undefined,
  });
  state.current = {
    parts: previewParts,
    contextOnly,
    selected: selection,
    visible,
    tool,
    assetId,
    height,
    snap,
    blocked,
    projection: props.projection,
    showGrid: true,
    floor: floorGuide,
    suppressNativeWalls:
      !doc.structure &&
      parts.some(
        (p) =>
          catalog?.assets.find((a) => a.id === p.assetId)?.category === "wall",
      ),
    structuralGuide: props.result
      ? {
          walls: props.result.walls,
          deckId: props.deckId,
          elevationUnits:
            doc.decks.find((d) => d.id === props.deckId)?.elevation ?? 0,
          heightUnits:
            doc.decks.find((d) => d.id === props.deckId)?.ceiling ?? 96,
        }
      : undefined,
  };
  function mutate(part: PartPlacement) {
    if (blocked || !catalog || structural(part.assetId)) return;
    commit((d) => editVisualPart(d, part, catalog));
  }
  function add(id: string, p: [number, number, number]) {
    if (
      blocked ||
      !catalog ||
      structural(id) ||
      !catalog.assets.some((a) => a.id === id)
    )
      return;
    const placement: PartPlacement = {
      id: uuid(),
      assetId: id,
      position: p,
      rotation: 0,
      flipped: false,
      removedCells: [],
    };
    commit((d) => {
      d.assembly ??= {
        schema: "sidereal.layout-assembly.v1",
        source: null,
        revisions: {},
        parts: [],
      };
      d.assembly.revisions[id] = visualRevision(catalog, id);
      d.assembly.parts.push(placement);
      return d;
    });
    select(placement.id);
  }
  function duplicate(
    part: PartPlacement,
    position: [number, number, number] = [
      part.position[0] + 1,
      part.position[1],
      part.position[2],
    ],
  ) {
    if (blocked || !catalog) return;
    if (structural(part.assetId)) return;
    const copy = { ...structuredClone(part), id: uuid(), position };
    commit((d) => {
      const existing = d.fittings.find((f) => f.id === part.id);
      if (existing) {
        d.fittings.push({ ...structuredClone(existing), id: copy.id });
        return editVisualPart(d, copy, catalog);
      }
      d.assembly ??= {
        schema: "sidereal.layout-assembly.v1",
        source: null,
        revisions: {},
        parts: [],
      };
      d.assembly.revisions[part.assetId] = visualRevision(
        catalog,
        part.assetId,
      );
      if (part.fittingProxy)
        d.assembly.revisions[part.fittingProxy.assetId] = visualRevision(
          catalog,
          part.fittingProxy.assetId,
        );
      d.assembly.parts.push(copy);
      return d;
    });
    select(copy.id);
  }
  function copySelected() {
    if (!selected || structural(selected.assetId)) return;
    clipboard.current = {
      part: structuredClone(selected),
      fitting: structuredClone(doc.fittings.find((f) => f.id === selected.id)),
      count: 0,
    };
    setCopiedLabel(selectedAsset?.label ?? selected.assetId);
  }
  function paste() {
    if (blocked || !catalog || !clipboard.current) return;
    const saved = clipboard.current;
    if (structural(saved.part.assetId)) return;
    saved.count++;
    const copy = {
      ...structuredClone(saved.part),
      id: uuid(),
      position: [
        saved.part.position[0] + saved.count,
        saved.part.position[1],
        saved.part.position[2],
      ] as [number, number, number],
    };
    commit((d) => {
      if (saved.fitting) {
        d.fittings.push({ ...structuredClone(saved.fitting), id: copy.id });
        return editVisualPart(d, copy, catalog);
      }
      d.assembly ??= {
        schema: "sidereal.layout-assembly.v1",
        source: null,
        revisions: {},
        parts: [],
      };
      d.assembly.revisions[copy.assetId] = visualRevision(
        catalog,
        copy.assetId,
      );
      if (copy.fittingProxy)
        d.assembly.revisions[copy.fittingProxy.assetId] = visualRevision(
          catalog,
          copy.fittingProxy.assetId,
        );
      d.assembly.parts.push(copy);
      return d;
    });
    select(copy.id);
    setTool("select");
  }
  function remove() {
    if (blocked || !selected || structural(selected.assetId)) return;
    commit((d) => {
      if (d.assembly)
        d.assembly.parts = d.assembly.parts.filter((p) => p.id !== selection);
      d.fittings = d.fittings.filter((p) => p.id !== selection);
      return d;
    });
    select("");
  }
  callback.current = {
    place: add,
    move: (id, p, copy) => {
      const part = parts.find((p) => p.id === id);
      if (part) {
        if (copy) duplicate(part, p);
        else mutate({ ...part, position: p });
      }
    },
  };
  useEffect(() => {
    if (!catalog || !canvasHost.current) return;
    // Async engine disposal retains only this detached canvas, never its successor.
    const ownedCanvas = mountEditorCanvas(
      canvasHost.current,
      "Editable 3D ship hull",
    );
    canvas.current = ownedCanvas;
    let disposed = false;
    import("@sidereal/render/layout-hull")
      .then(({ createHullViewport }) => {
        if (disposed || !canvas.current) return;
        const v = createHullViewport(
          canvas.current,
          catalog,
          {
            select,
            move: (...args) => callback.current.move(...args),
            place: (...args) => callback.current.place(...args),
            status: setStatus,
            wallFit: setWallNotes,
            viewChanged: () => {
              if (viewport.current && props.sharedViewport) {
                props.sharedViewport.current.documentId = latest.current.doc.id;
                props.sharedViewport.current.camera =
                  viewport.current.getCamera();
                props.sharedViewport.current.projection =
                  latest.current.projection;
              }
            },
          },
          camera.current,
          props.sharedViewport?.current.projection,
        );
        viewport.current = v;
        if (props.sharedViewport)
          props.sharedViewport.current.actions = {
            fit: () => v.fit(),
            zoom: (delta) => v.zoom(delta),
          };
        v.update(state.current);
        v.ready().then(() => {
          if (!disposed && !camera.current) v.fit();
        });
      })
      .catch((e) => {
        if (!disposed)
          setStatus(`Workbench unavailable: ${String(e)}. Draft preserved.`);
      });
    return () => {
      disposed = true;
      if (viewport.current) {
        camera.current = viewport.current.getCamera();
        if (props.sharedViewport) {
          props.sharedViewport.current.camera = camera.current;
          props.sharedViewport.current.documentId = lastDoc.current;
          props.sharedViewport.current.projection = latest.current.projection;
          props.sharedViewport.current.actions = undefined;
        }
        viewport.current.dispose();
        viewport.current = null;
      }
      ownedCanvas.remove();
      if (canvas.current === ownedCanvas) canvas.current = null;
    };
  }, [catalog]);
  useEffect(() => {
    viewport.current?.update(state.current);
    if (lastDoc.current !== doc.id) {
      lastDoc.current = doc.id;
      select(props.initialSelection ?? "");
      if (props.initialRoofVisible === false) {
        setVisible(
          (current) =>
            new Set([...current].filter((category) => category !== "roof")),
        );
      }
      viewport.current?.ready().then(() => viewport.current?.fit());
    }
  }, [
    doc,
    props.result,
    props.projection,
    props.deckId,
    props.initialSelection,
    props.initialRoofVisible,
    selection,
    visible,
    tool,
    assetId,
    height,
    snap,
    blocked,
  ]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"],dialog',
        )
      )
        return;
      if (e.key === "Escape") {
        viewport.current?.cancel();
        setTool("select");
        return;
      }
      if (canvas.current?.dataset.gestureActive === "true") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selected) {
        e.preventDefault();
        copySelected();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        paste();
        return;
      }
      if (
        blocked ||
        canvas.current?.dataset.gestureActive === "true" ||
        !selected
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate(selected);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove();
      } else if (e.key.toLowerCase() === "r")
        mutate({ ...selected, rotation: selected.rotation + Math.PI / 2 });
      else if (e.key.toLowerCase() === "f")
        mutate({ ...selected, flipped: !selected.flipped });
      else if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        mutate({
          ...selected,
          position: [
            selected.position[0] +
              (e.key === "ArrowLeft"
                ? -snap
                : e.key === "ArrowRight"
                  ? snap
                  : 0),
            selected.position[1] +
              (e.key === "ArrowUp" ? snap : e.key === "ArrowDown" ? -snap : 0),
            selected.position[2],
          ],
        });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const currentIds = new Set(parts.map((p) => p.assetId));
  const palette =
    catalog?.assets
      .filter(
        (a) =>
          !structural(a.id) &&
          (category === "all" || a.category === category) &&
          a.label.toLowerCase().includes(search.toLowerCase()) &&
          (library === "all" || currentIds.has(a.id) || !!a.visual),
      )
      .sort(
        (a, b) =>
          Number(!!b.visual) - Number(!!a.visual) ||
          a.label.localeCompare(b.label),
      ) ?? [];
  return (
    <div
      className="hull-workspace"
      data-hull-workspace
      data-left={showLibrary ? "open" : "closed"}
      data-right={showInspector ? "open" : "closed"}
    >
      <aside
        hidden={!showLibrary}
        className="hull-library"
        aria-label="Hull component library"
      >
        <h2>
          {props.mode === "Objects"
            ? "Objects & equipment"
            : "Ship building blocks"}
        </h2>
        {doc.legacy && (
          <button
            disabled={blocked}
            onClick={() => {
              if (!catalog || !doc.legacy) return;
              try {
                const source = JSON.parse(doc.legacy.sourceRaw);
                const copy = importShipAssembly(
                  source.present ?? source,
                  catalog,
                  uuid(),
                  uuid(),
                );
                copy.legacy = structuredClone(doc.legacy);
                props.adopt(copy);
              } catch (e) {
                props.error(`${String(e)}. Preserved source is unchanged.`);
              }
            }}
          >
            Edit preserved assembly as a copy
          </button>
        )}
        {props.catalogError && <p role="alert">{props.catalogError}</p>}
        <label>
          Find component
          <input
            aria-label="Find hull component"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Category
          <select
            aria-label="Hull component category"
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
          >
            <option value="all">All components</option>
            {PART_CATEGORIES.filter(
              (c) => !["floor", "wall", "roof"].includes(c),
            ).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Library
          <select
            aria-label="Hull library scope"
            value={library}
            onChange={(e) => setLibrary(e.target.value as typeof library)}
          >
            <option value="current">Native kit + this ship</option>
            <option value="all">All retained components</option>
          </select>
        </label>
        <div className="hull-palette">
          {palette.map((a) => (
            <button
              key={a.id}
              aria-label={`Place ${a.label}`}
              aria-pressed={assetId === a.id && tool === "place"}
              disabled={blocked}
              draggable={!blocked}
              onDragStart={(e) =>
                e.dataTransfer.setData("application/sidereal-hull", a.id)
              }
              onClick={() => {
                setAsset(a.id);
                setTool("place");
              }}
            >
              {a.thumbnail ? (
                <img
                  loading="lazy"
                  src={a.thumbnail}
                  alt=""
                  onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                />
              ) : (
                <Box size={28} />
              )}
              <span title={a.label}>
                {a.label
                  .replace(/^(equipment|room) /i, "")
                  .replace(/(?: -?\d+(?:\.\d+)?)+$/, "")}
              </span>
              <small>{a.visual ? "Blender mesh" : "Retained part"}</small>
            </button>
          ))}
        </div>
      </aside>
      <section className="hull-center">
        <ViewportDeckControl
          doc={doc}
          deckId={props.deckId}
          onChange={props.onDeckChange}
        />
        <div className="hull-toolbar">
          <button
            className="hull-pane-toggle"
            aria-label="Toggle component library"
            onClick={() => {
              setShowLibrary((v) => !v);
              if (innerWidth <= 760) setShowInspector(false);
            }}
          >
            <PanelLeftClose size={17} />
          </button>
          <button
            aria-label="Select and move components"
            aria-pressed={tool === "select"}
            onClick={() => setTool("select")}
          >
            <Move size={17} />
            Move
          </button>
          <button
            aria-label="Orbit ship"
            aria-pressed={tool === "orbit"}
            onClick={() => setTool("orbit")}
          >
            <Orbit size={17} />
            Orbit
          </button>
          <button aria-label="Fit ship" onClick={() => viewport.current?.fit()}>
            <Focus size={17} />
            Fit
          </button>
          <button
            aria-label="Copy selected component"
            disabled={!selected}
            onClick={copySelected}
          >
            <Copy size={17} />
            Copy
          </button>
          <button
            aria-label="Paste component"
            disabled={blocked || !copiedLabel}
            onClick={paste}
          >
            <Plus size={17} />
            Paste
          </button>
          <button
            className="hull-pane-toggle"
            aria-label="Toggle component inspector"
            onClick={() => {
              setShowInspector((v) => !v);
              if (innerWidth <= 760) setShowLibrary(false);
            }}
          >
            <PanelRightClose size={17} />
          </button>
          <label>
            Snap
            <select
              aria-label="Hull snap"
              value={snap}
              onChange={(e) => {
                const value = Number(e.target.value);
                setSnap(value);
                props.onGridChange?.(value);
              }}
            >
              {[0.03125, 0.5, 1, 2].map((n) => (
                <option value={n} key={n}>
                  {n} m
                </option>
              ))}
            </select>
          </label>
          <label>
            Build height
            <input
              aria-label="Build height"
              type="number"
              min="-256"
              max="256"
              step={snap}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
            />
            <span>m</span>
          </label>
        </div>
        <div
          className="hull-viewport"
          onDragOver={(e) => {
            if (!blocked) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("application/sidereal-hull"),
              p = viewport.current?.dropPoint(e.clientX, e.clientY);
            if (id && p) add(id, p);
          }}
        >
          <div className="editor-gpu-surface" ref={canvasHost} />
          {visible.has("wall") && <WallFitNotes notes={wallNotes} />}
          <div className="hull-caption">
            <strong>{doc.name}</strong>
            <span>
              {tool === "place"
                ? `Place ${asset?.label ?? "component"} · click on build plane`
                : "Middle drag or Orbit to rotate · right drag to pan · wheel to zoom"}
            </span>
          </div>
          {tool === "place" && (
            <button className="hull-cancel" onClick={() => setTool("select")}>
              Cancel placement · Esc
            </button>
          )}
        </div>
        <div className="hull-render-status" role="status">
          {copiedLabel && <span>Copied: {copiedLabel}</span>}
          {status}
          <span>{parts.length} placements · shared local history</span>
        </div>
      </section>
      <aside
        hidden={!showInspector}
        className="hull-inspector"
        aria-label="Hull component inspector"
      >
        <div
          className="hull-inspector-tabs"
          role="group"
          aria-label="Component inspector sections"
        >
          {["Properties", "Layers", "Overview"].map((tab) => (
            <button
              key={tab}
              aria-pressed={inspectorTab === tab}
              onClick={() => setInspectorTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div hidden={inspectorTab !== "Properties"}>
          <h2>{selected ? "Selected component" : "Ship information"}</h2>
          {mismatches.length > 0 && (
            <p role="alert">
              {mismatches.length} components have unavailable revisions. Draft
              preserved; export before resolving the catalog.
            </p>
          )}
          {selected ? (
            <>
              <h3>{selectedAsset?.label ?? selected.assetId}</h3>
              <p className="hull-id">{selected.id}</p>
              {!fitting && (
                <HullDecalPanel
                  part={selected}
                  asset={selectedAsset}
                  disabled={blocked}
                  change={(decals) => mutate({ ...selected, decals })}
                />
              )}
              {(["East", "North", "Height"] as const).map((label, i) => (
                <label key={label}>
                  {label} · m
                  <input
                    aria-label={`Component ${label.toLowerCase()}`}
                    type="number"
                    step={snap}
                    min="-256"
                    max="256"
                    disabled={blocked || (fitting && i === 2)}
                    value={selected.position[i]}
                    onChange={(e) => {
                      const p = [...selected.position] as [
                        number,
                        number,
                        number,
                      ];
                      p[i] = Number(e.target.value);
                      mutate({ ...selected, position: p });
                    }}
                  />
                </label>
              ))}
              {fitting && (
                <p className="layout-note">
                  This fitting rests on its named deck. Move it in the floorplan
                  to change its room.
                </p>
              )}
              <label>
                Yaw · degrees
                <input
                  aria-label="Component yaw"
                  type="number"
                  step="90"
                  disabled={blocked}
                  value={
                    Math.round(((selected.rotation * 180) / Math.PI) * 1000) /
                    1000
                  }
                  onChange={(e) =>
                    mutate({
                      ...selected,
                      rotation: (Number(e.target.value) * Math.PI) / 180,
                    })
                  }
                />
              </label>
              <div className="hull-actions">
                <button
                  title="Rotate component"
                  aria-label="Rotate component"
                  disabled={blocked}
                  onClick={() =>
                    mutate({
                      ...selected,
                      rotation: selected.rotation + Math.PI / 2,
                    })
                  }
                >
                  <RotateCw size={16} />
                  Rotate
                </button>
                <button
                  title="Mirror component"
                  aria-label="Mirror component"
                  aria-pressed={selected.flipped}
                  disabled={blocked}
                  onClick={() =>
                    mutate({ ...selected, flipped: !selected.flipped })
                  }
                >
                  <FlipHorizontal size={16} />
                  Mirror
                </button>
                <button
                  title="Duplicate component"
                  aria-label="Duplicate component"
                  disabled={blocked}
                  onClick={() => duplicate(selected)}
                >
                  <Copy size={16} />
                  Duplicate
                </button>
                <button
                  title="Delete component"
                  aria-label="Delete component"
                  disabled={blocked}
                  onClick={remove}
                >
                  <Trash2 size={16} />
                  Delete
                </button>
                <button
                  title="Focus component"
                  aria-label="Focus component"
                  onClick={() => viewport.current?.fit(selection)}
                >
                  <Focus size={16} />
                  Focus
                </button>
              </div>
              <p className="layout-note">
                {selectedAsset?.visual
                  ? "Existing Blender surface and materials."
                  : "Existing retained part-library surface."}{" "}
                Changes affect this placement only.
              </p>
              {!!selected.removedCells.length && (
                <p className="layout-note">
                  Preserved damage proposal: {selected.removedCells.length}{" "}
                  cells. This view shows the intact source surface.
                </p>
              )}
            </>
          ) : (
            <>
              <ShipSummary doc={doc} result={props.result} />
              <p className="layout-note">
                Select equipment, engines or exterior armor in the viewport or
                component list. Drag to move; Ctrl-drag to duplicate.
              </p>
            </>
          )}
          {props.mode === "Hull" && (
            <aside className="hull-mount-note">
              <strong>Free placement · origin-to-grid</strong>
              <p>
                Grid snapping aligns the part origin, not its attachment face.
                Height is set separately. Wall contact and armor clearance are
                not validated.
              </p>
              <p>
                Visible r004 walls: 125 mm envelope centred on the boundary; 3 m
                authored top. Exterior walls ultimately need outward-only
                thickness.
              </p>
            </aside>
          )}
          {asset && (
            <button
              disabled={blocked}
              className="hull-add-origin"
              onClick={() => add(asset.id, [0, 0, height])}
            >
              <Plus size={16} />
              Add chosen part at origin
            </button>
          )}
        </div>
        <div hidden={inspectorTab !== "Layers"}>
          <h3>Visibility</h3>
          <div className="hull-layers">
            {PART_CATEGORIES.map((c) => (
              <label key={c}>
                <input
                  type="checkbox"
                  aria-label={`Show ${c} components`}
                  checked={visible.has(c)}
                  onChange={() => {
                    const next = new Set(visible);
                    next.has(c) ? next.delete(c) : next.add(c);
                    setVisible(next);
                    if (props.layers)
                      props.onLayersChange?.({
                        ...props.layers,
                        [categoryLayer[c]]: next.has(c),
                      });
                  }}
                />
                {c}
              </label>
            ))}
          </div>
        </div>
        <div hidden={inspectorTab !== "Overview"}>
          <h3>
            Placed components (
            {parts.filter((p) => !contextOnly.has(p.id)).length})
          </h3>
          <div className="hull-components">
            {parts
              .filter((p) => !contextOnly.has(p.id))
              .map((p) => (
                <button
                  key={p.id}
                  aria-label={`Select component ${p.id}`}
                  aria-pressed={selection === p.id}
                  onClick={(event) => {
                    select(p.id);
                    setInspectorTab("Properties");
                    setTool("select");
                    event.currentTarget
                      .closest(".hull-inspector")
                      ?.scrollTo({ top: 0 });
                  }}
                >
                  <span>
                    {catalog?.assets.find((a) => a.id === p.assetId)?.label ??
                      p.assetId}
                  </span>
                  <small>{p.id}</small>
                </button>
              ))}
          </div>
          <p className="layout-note">
            Visual assembly only. Floor topology, collision and live
            installation remain separate. Publish and refit stay disabled.
          </p>
        </div>
      </aside>
    </div>
  );
}
