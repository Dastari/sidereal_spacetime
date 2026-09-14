import { LayoutContextOverlay } from "./LayoutContextOverlay";
import { WallFitNotes } from "./WallFitNotes";
import { MeasurementReadout } from "./MeasurementReadout";
import type { MeasurementPoint } from "@sidereal/render/layout-measurement";
import { mountEditorCanvas } from "../../editor/mountEditorCanvas";
import { useEditorPanels } from "../../editor/useEditorPanels";
import {
  isExteriorAsset,
  isObjectAsset,
} from "@sidereal/content/layout-asset-scope";
import { upgradeWayfarerHullLayout } from "@sidereal/content/upgrade-wayfarer-hull-layout";
import {
  hullAttachmentProfile,
  snapHullAttachment,
} from "@sidereal/sim/layout-hull-attachment";
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
  Ruler,
  Trash2,
} from "lucide-react";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
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
  const [measurements, setMeasurements] = useState<MeasurementPoint[]>([]);
  const [inspectorTab, setInspectorTab] = useState("Properties");
  const [selection, select] = useState(props.initialSelection ?? ""),
    [assetId, setAsset] = useState(""),
    [tool, setTool] = useState<HullViewState["tool"]>("select"),
    [category, setCategory] = useState<PartCategory | "all">(
      props.mode === "Objects" ? "all" : "superstructure",
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
    engine: "objects",
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
  }, [props.mode, props.layers]);
  const contextOverlay = useRef<() => void>(() => {});
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
    setCategory(props.mode === "Objects" ? "all" : "superstructure");
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
    move: (
      _id: string,
      _p: [number, number, number],
      _copy: boolean,
      _axis?: "xy" | "z",
    ) => {},
    place: (_id: string, _p: [number, number, number]) => {},
  });
  const editable = (id: string) => {
    const asset = catalog?.assets.find((a) => a.id === id);
    return (
      !!asset &&
      (props.mode === "Hull" ? isExteriorAsset(asset) : isObjectAsset(asset))
    );
  };
  const structural = (id: string) => !editable(id);
  useEffect(() => {
    if (selectedAsset && !editable(selectedAsset.id)) select("");
  }, [props.mode, selectedAsset]);
  const contextOnly = new Set(
    parts.filter((p) => !editable(p.assetId)).map((p) => p.id),
  );
  const previewParts = parts;
  const floorGuide = props.result
    ? {
        ...props.result,
        tiles: props.result.tiles.filter((t) => t.deckId === props.deckId),
      }
    : undefined;
  useEffect(() => {
    setHeight(
      ((doc.decks.find((d) => d.id === props.deckId)?.elevation ?? 0) +
        PINNED_FLOOR_KIT.datums.floorTop) /
        32,
    );
  }, [props.deckId, props.mode]);
  const state = useRef<HullViewState>({
    parts: previewParts,
    contextOnly,
    resolvePlacement: resolveAttachment,
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
    floorSlabs: { document: doc, deckId: props.deckId },
    insetPreview:
      doc.structure?.schema === "sidereal.layout-structure.v2" && props.result
        ? { document: doc, compiled: props.result, deckId: props.deckId }
        : undefined,
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
    resolvePlacement: resolveAttachment,
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
    floorSlabs: { document: doc, deckId: props.deckId },
    insetPreview:
      doc.structure?.schema === "sidereal.layout-structure.v2" && props.result
        ? { document: doc, compiled: props.result, deckId: props.deckId }
        : undefined,
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
  function resolveAttachment(
    part: PartPlacement,
    axis?: "xy" | "z",
  ): PartPlacement | null {
    // A height gesture preserves the existing horizontal mounting frame exactly.
    if (axis === "z") return part;
    const asset = catalog?.assets.find((a) => a.id === part.assetId);
    if (props.mode !== "Hull" || !asset || !hullAttachmentProfile(asset))
      return part;
    if (!props.result) return null;
    return (
      snapHullAttachment(part, asset, doc, props.result, props.deckId, 2, {
        // Build height defaults to the deck datum; edits, copies, and explicit
        // placement heights retain the elevation the author selected.
        preserveHeight: true,
      })?.part ?? null
    );
  }
  function attached(
    part: PartPlacement,
    axis?: "xy" | "z",
  ): PartPlacement | null {
    const result = resolveAttachment(part, axis);
    if (!result)
      props.error(
        "Move this hull panel within 2 m of an exterior wall with enough space for its attachment frame.",
      );
    return result;
  }
  function mutate(part: PartPlacement, axis?: "xy" | "z") {
    if (blocked || !catalog || structural(part.assetId)) return;
    const resolved = attached(part, axis);
    if (resolved) commit((d) => editVisualPart(d, resolved, catalog));
  }
  function add(id: string, p: [number, number, number]) {
    if (
      blocked ||
      !catalog ||
      structural(id) ||
      !catalog.assets.some((a) => a.id === id)
    )
      return;
    const placement = attached({
      id: uuid(),
      assetId: id,
      position: p,
      rotation: 0,
      flipped: false,
      removedCells: [],
    });
    if (!placement) return;
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
    axis?: "xy" | "z",
  ) {
    if (blocked || !catalog) return;
    if (structural(part.assetId)) return;
    const copy = attached(
      { ...structuredClone(part), id: uuid(), position },
      axis,
    );
    if (!copy) return;
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
    const copy = attached({
      ...structuredClone(saved.part),
      id: uuid(),
      position: [
        saved.part.position[0] + saved.count,
        saved.part.position[1],
        saved.part.position[2],
      ] as [number, number, number],
    });
    if (!copy) return;
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
      if (d.serviceConnections)
        d.serviceConnections = d.serviceConnections.filter(
          (c) => c.fromDeviceId !== selection && c.toDeviceId !== selection,
        );
      return d;
    });
    select("");
  }
  callback.current = {
    place: add,
    move: (id, p, copy, axis) => {
      const part = parts.find((p) => p.id === id);
      if (part) {
        if (copy) duplicate(part, p, axis);
        else mutate({ ...part, position: p }, axis);
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
            measurementChanged: setMeasurements,
            viewChanged: () => {
              contextOverlay.current();
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
      viewport.current?.clearMeasurements();
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
    props.mode,
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
    // A measurement is a snapshot of visible geometry, never a stale attachment
    // carried across edits, decks, or a different set of visible layers.
    viewport.current?.clearMeasurements();
  }, [doc, props.deckId, props.layers]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"],dialog',
        )
      )
        return;
      if (e.key === "Escape") {
        if (tool === "measure") {
          viewport.current?.clearMeasurements();
          return;
        }
        viewport.current?.cancel();
        setTool("select");
        return;
      }
      if (canvas.current?.dataset.gestureActive === "true") return;
      if (tool === "measure" && e.key === "Backspace") {
        e.preventDefault();
        viewport.current?.removeMeasurementPoint();
        return;
      }
      if (
        tool === "measure" &&
        [
          "Delete",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "r",
          "f",
        ].includes(e.key)
      )
        return;
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        // Ctrl+D deselects (owner convention); Ctrl+Shift+D duplicates.
        e.preventDefault();
        if (!e.shiftKey) {
          select("");
          return;
        }
      }
      if (
        blocked ||
        canvas.current?.dataset.gestureActive === "true" ||
        !selected
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
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
        if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
          mutate(
            {
              ...selected,
              position: [
                selected.position[0],
                selected.position[1],
                selected.position[2] + (e.key === "ArrowUp" ? snap : -snap),
              ],
            },
            "z",
          );
          return;
        }
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
          (library === "all" ||
            a.visual?.designId !== "shipyard.hull.side-armor" ||
            a.visual.revision >= 5) &&
          a.label.toLowerCase().includes(search.toLowerCase()) &&
          (library === "all" ||
            currentIds.has(a.id) ||
            !!a.visual ||
            a.category === "engine"),
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
        aria-label="Component library"
      >
        <h2>{props.mode === "Objects" ? "Objects" : "Exterior hull"}</h2>
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
            aria-label="Find component"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Category
          <select
            aria-label="Component category"
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
          >
            <option value="all">All components</option>
            {PART_CATEGORIES.filter((c) =>
              catalog?.assets.some((a) => a.category === c && editable(a.id)),
            ).map((c) => (
              <option key={c} value={c}>
                {c === "engine" ? "Engines & thrusters" : c}
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
            title="Drag to move across the deck. Hold Shift before dragging to move up or down."
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
            aria-label="Measure vertices"
            aria-pressed={tool === "measure"}
            title="Measure between vertices on visible objects"
            onClick={() => {
              viewport.current?.cancel();
              setTool("measure");
            }}
          >
            <Ruler size={17} />
            Measure
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
              {[0.03125, 0.0625, 0.125, 0.25, 0.5, 1, 2].map((n) => (
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
          <LayoutContextOverlay
            doc={doc}
            result={props.result}
            deckId={props.deckId}
            catalog={catalog}
            layers={props.layers}
            viewport={viewport}
            refresh={contextOverlay}
          />
          {tool === "measure" && (
            <MeasurementReadout
              points={measurements}
              onClear={() => viewport.current?.clearMeasurements()}
              onRemove={() => viewport.current?.removeMeasurementPoint()}
            />
          )}
          {visible.has("wall") && <WallFitNotes notes={wallNotes} />}
          {tool === "place" && (
            <button className="hull-cancel" onClick={() => setTool("select")}>
              Cancel placement · Esc
            </button>
          )}
        </div>
        <div className="hull-render-status" role="status">
          {copiedLabel && <span>Copied: {copiedLabel}</span>}
          {status}
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
          {["Properties", "Overview"].map((tab) => (
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
              {!fitting && (
                <p className="layout-note">
                  Drag to move. Shift + drag or Shift + ↑ / ↓ changes height.
                </p>
              )}
              {props.mode === "Hull" && selectedAsset && (
                <p className="layout-note">
                  {hullAttachmentProfile(selectedAsset)
                    ? "Attached to structural wall · outward face"
                    : "Grid placement · mounting interface pending"}
                </p>
              )}
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
                      mutate(
                        { ...selected, position: p },
                        i === 2 ? "z" : "xy",
                      );
                    }}
                  />
                </label>
              ))}
              {fitting && (
                <p className="layout-note">
                  This floorplan fitting stays on its named deck. Height changes
                  need a 3D placement with its fitting volume preserved.
                </p>
              )}
              <label>
                Yaw · degrees
                <input
                  aria-label="Component yaw"
                  type="number"
                  step="90"
                  disabled={
                    blocked ||
                    !!(selectedAsset && hullAttachmentProfile(selectedAsset))
                  }
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
                  disabled={
                    blocked ||
                    !!(selectedAsset && hullAttachmentProfile(selectedAsset))
                  }
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
            </>
          )}
          {props.mode === "Hull" &&
            catalog &&
            parts.some(
              (p) =>
                catalog.assets.find((a) => a.id === p.assetId)?.visual
                  ?.designId === "shipyard.hull.side-armor" &&
                catalog.assets.find((a) => a.id === p.assetId)?.visual
                  ?.revision === 3,
            ) && (
              <button
                disabled={blocked}
                onClick={() =>
                  commit((d) => upgradeWayfarerHullLayout(d, catalog))
                }
              >
                Use standard hull attachments
              </button>
            )}
          {props.mode === "Hull" && (
            <details className="editor-disclosure">
              <summary>Placement limits</summary>
              <p>
                Hull panels with attachment frames snap to the outside wall
                face. Other exterior parts use the placement grid until their
                mounting interfaces are qualified.
              </p>
            </details>
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
