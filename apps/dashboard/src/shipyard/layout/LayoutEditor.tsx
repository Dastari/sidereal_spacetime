import { editorCommand, editorKeyTarget } from "@sidereal/ui/editor-commands";
import { deleteLayoutSelection } from "./selection-deletion";
import type { PartAsset, PartCatalog } from "@sidereal/content/assembly";
import { assemblyMismatches } from "@sidereal/content/layout-assembly";
import {
  type LayoutDocument,
  type Point,
  type ServiceChannel,
  type Shape,
} from "@sidereal/content/ship-layout";
import { assertHullEnvelopeFits } from "@sidereal/sim/layout-structure";
import { ModeTabs, PanelResizeHandle } from "@sidereal/ui/editor-controls";
import { Box, Search } from "lucide-react";
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useEditorPanels } from "../../editor/useEditorPanels";
import { DocumentBar } from "./DocumentBar";
import { enterEditorMode, enterStructuralTool } from "./editor-mode-policy";
import { applyLayoutGesture } from "./layout-gestures";
import "./layout.css";
import LayoutCanvas, { type Tool } from "./LayoutCanvas";
import {
  LayoutInspector,
  LayoutPalette,
  type LayoutPanelContext,
} from "./LayoutPanels";
import { LayoutToolbar } from "./LayoutToolbar";
import { NewLayoutDialog } from "./NewLayoutDialog";
import { transformTiles, type ViewState } from "./state";
import wayfarerTemplate from "./templates/wayfarer-r001.json";
import { useLayout, uuid } from "./useLayout";
import type { SharedLayoutViewport } from "./viewport-state";
import { ViewportDeckControl } from "./ViewportDeckControl";
import {
  WAYFARER_TEMPLATE_HASH,
  WAYFARER_TEMPLATE_ID,
} from "./wayfarer-template";
import "./workbench.css";
const HullWorkspace = lazy(() => import("./HullWorkspace"));
const modes = ["Structure", "Rooms", "Objects", "Hull", "Systems"] as const;
const projections = ["Top", "Side", "Front", "3D"] as const;
export default function LayoutEditor() {
  const {
    left: showLeft,
    right: showRight,
    setLeft: toggleLeft,
    setRight: toggleRight,
  } = useEditorPanels();
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
    [inspector, setInspector] = useState<"Inspector" | "Layers" | "Validation">(
      "Inspector",
    ),
    [newDialog, setNewDialog] = useState(false),
    [reuseNodes, setReuseNodes] = useState(false),
    [inspectCabinet, setInspectCabinet] = useState(false);
  const fromCurrentWayfarer = doc?.dependencies.some(
    (d) =>
      d.id === `template-origin:${WAYFARER_TEMPLATE_ID}` &&
      d.revision === WAYFARER_TEMPLATE_HASH,
  );
  function inspectWayfarer() {
    if (!editor.createFromWayfarer(wayfarerTemplate)) return;
    setNewDialog(false);
    select([]);
    setTool("select");
    setInspectCabinet(false);
    shell.current
      ?.querySelector(".layout-source-context")
      ?.removeAttribute("open");
    setView((v) => ({ ...v, mode: "Objects", projection: "3D" }));
  }
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
    editor.commit((current) => {
      const next = change(current);
      assertHullEnvelopeFits(next);
      return next;
    });
  }
  const sharedViewport = useRef<SharedLayoutViewport>({});
  const [canvasOnly, setCanvasOnly] = useState(false);
  function resetWorkspace() {
    select([]);
    setTool("select");
    setInspectCabinet(false);
    sharedViewport.current = {};
    setView((v) => ({
      ...v,
      mode: "Structure",
      projection: "Top",
      layers: {
        ...v.layers,
        floor: true,
        walls: true,
        roof: false,
        objects: false,
        exteriorHull: false,
      },
    }));
  }
  function redesignCurrent() {
    if (editor.createFloorplanFromCurrent()) resetWorkspace();
  }

  const shell = useRef<HTMLElement>(null);
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
    if (blocked || !selection.length) return;
    const perimeterSelected = result?.walls.some(
      (w) =>
        w.source === "perimeter" &&
        (selection.includes(w.anchorId) || selection.includes(w.key)),
    );
    if (perimeterSelected && selection.length === 1) {
      editor.setError(
        "Exterior walls follow the floorplan. Select floor tiles to change the outer boundary.",
      );
      return;
    }
    commit((d) =>
      deleteLayoutSelection(
        d,
        result,
        selection,
        view.mode === "Systems" ? catalog : undefined,
      ),
    );
    select([]);
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        editorKeyTarget(e.target) ||
        e.defaultPrevented ||
        !(e.target instanceof Node && shell.current?.contains(e.target)) ||
        newDialog
      )
        return;
      if (e.key === "Escape") setCanvasOnly(false);
      const mod = e.ctrlKey || e.metaKey;
      const command = editorCommand(e);
      if (
        (view.mode === "Hull" || view.mode === "Objects") &&
        !(mod && ["s", "z", "y"].includes(e.key.toLowerCase()))
      )
        return;
      if (command === "select" || command === "pan") {
        e.preventDefault();
        setTool(command);
        return;
      }
      if (e.key === "Escape") {
        cancel();
        select([]);
        return;
      }
      if (document.querySelector('[data-gesture-active="true"]')) return;
      if (command === "save") {
        e.preventDefault();
        editor.save();
        return;
      }
      if (blocked) return;
      if (command === "undo" || command === "redo") {
        e.preventDefault();
        command === "redo" ? editor.redo() : editor.undo();
      } else if (command === "delete") {
        e.preventDefault();
        remove();
      } else if (e.key.toLowerCase() === "r") {
        selection.length ? transform("rotate") : setTurns((t) => (t + 1) % 4);
      } else if (e.key.toLowerCase() === "f") {
        transform(e.shiftKey ? "mirror-y" : "mirror-x");
      } else if (command === "duplicate") {
        e.preventDefault();
        transform("copy", [64, 0]);
      } else if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        transform("move", [
          e.key === "ArrowLeft"
            ? -view.grid * (e.shiftKey ? 10 : 1)
            : e.key === "ArrowRight"
              ? view.grid * (e.shiftKey ? 10 : 1)
              : 0,
          e.key === "ArrowDown"
            ? -view.grid * (e.shiftKey ? 10 : 1)
            : e.key === "ArrowUp"
              ? view.grid * (e.shiftKey ? 10 : 1)
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
    setView((current) => enterEditorMode(current, value));
    setTool("select");
    setSearch("");
    select([]);
  }
  function fit() {
    if (sharedViewport.current.actions) {
      sharedViewport.current.actions.fit();
      return;
    }
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
  const componentMode = view.mode === "Hull" || view.mode === "Objects";
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
    setTool: (next) => {
      if (["stamp", "fill", "partition", "door", "hole"].includes(next))
        setView((current) => enterStructuralTool(current));
      setTool(next);
    },
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
    selectedWallKey: result?.walls.find(
      (w) => selection.includes(w.anchorId) || selection.includes(w.key),
    )?.anchorId,
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
      tabIndex={-1}
      onPointerDownCapture={(e) => {
        if (!editorKeyTarget(e.target))
          e.currentTarget.focus({ preventScroll: true });
      }}
      style={
        {
          "--layout-left": `${view.leftWidth}px`,
          "--layout-right": `${view.rightWidth}px`,
        } as CSSProperties
      }
      data-layout-fingerprint={result?.fingerprint}
      data-canvas-only={canvasOnly}
    >
      <DocumentBar
        editor={editor}
        blocked={blocked}
        commit={commit}
        onNew={() => setNewDialog(true)}
      />
      <div className="layout-mode-bar">
        <ModeTabs
          label="Layout modes"
          values={modes}
          value={view.mode}
          onChange={mode}
        />
        <details className="layout-source-context">
          <summary>
            {fromCurrentWayfarer
              ? "Wayfarer template · editable local copy"
              : "Templates and source"}{" "}
            <span>Local draft · saved game is unchanged</span>
          </summary>
          <div className="layout-legacy">
            <button
              onClick={inspectWayfarer}
              disabled={editor.blocked}
              title={
                editor.blocked
                  ? "Resolve or export the current recovery/conflict first"
                  : "Preserve this draft and open a separate editable copy of the current game source template"
              }
            >
              <Search size={16} /> Inspect current Wayfarer template
            </button>
            <span>
              {fromCurrentWayfarer
                ? `Source: Wayfarer template r001 · ${WAYFARER_TEMPLATE_HASH.slice(0, 12)}. Separate editable local draft.`
                : "Open the current game source template in Objects/3D; your current draft is preserved."}{" "}
              This is not a live ship capture. Saved game changes and additional
              fuel attachments are not included.
            </span>
          </div>
        </details>
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
      {!!doc?.assembly?.parts.length && (
        <div className="layout-model-notice">
          <span>
            This draft includes the old assembled ship. Its walls are separate
            from the floorplan.
          </span>
          <button disabled={blocked} onClick={redesignCurrent}>
            Redesign this floorplan
          </button>
        </div>
      )}
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
        <details className="layout-legacy-recovery">
          <summary>Previous assembly draft available</summary>
          <div className="layout-legacy">
            <span>
              Assembly-v1 draft found. Original data and history are preserved.
            </span>
            <button onClick={editor.migrate}>
              Migrate as visual references
            </button>
            <button onClick={editor.exportLegacy}>Export original</button>
            <a href="/shipyard?assembly=legacy">Open assembly editor</a>
          </div>
        </details>
      )}
      {(view.mode === "Hull" || view.mode === "Objects") && doc ? (
        <Suspense
          fallback={
            <div className="workspace-loading" role="status">
              Loading component tools…
            </div>
          }
        >
          <HullWorkspace
            onDeckChange={(deckId) => updateView({ deckId })}
            sharedViewport={sharedViewport}
            layers={view.layers}
            onLayersChange={(layers) => updateView({ layers })}
            grid={view.grid / 32}
            onGridChange={(grid) => updateView({ grid: grid * 32 })}
            initialRoofVisible={
              inspectCabinet && fromCurrentWayfarer ? false : undefined
            }
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
        </Suspense>
      ) : (
        <div
          className={`layout-workspace ${showLeft ? "" : "left-closed"} ${showRight ? "" : "right-closed"}`}
        >
          <LayoutPalette {...panelContext} />
          <PanelResizeHandle
            side="left"
            width={view.leftWidth}
            onResize={(width) => updateView({ leftWidth: width })}
          />
          <section className="layout-center">
            <LayoutToolbar
              tool={tool}
              blocked={blocked}
              hasSelection={selection.length > 0}
              partitionSelected={!!selectedPartition}
              onTool={setTool}
              onFit={fit}
              onAction={(action) => {
                if (action === "remove") remove();
                else if (action === "rotate" && !selection.length)
                  setTurns((t) => (t + 1) % 4);
                else transform(action, action === "copy" ? [64, 0] : [0, 0]);
              }}
              onToggle={(side) => {
                if (side === "left") {
                  toggleLeft((v) => !v);
                  if (innerWidth < 1100) toggleRight(false);
                } else {
                  toggleRight((v) => !v);
                  if (innerWidth < 1100) toggleLeft(false);
                }
              }}
              onZoom={(direction) => {
                if (sharedViewport.current.actions)
                  sharedViewport.current.actions.zoom(
                    direction === "in" ? -120 : 120,
                  );
                else
                  updateView({
                    camera: {
                      ...view.camera,
                      scale: Math.max(
                        0.025,
                        Math.min(
                          6,
                          view.camera.scale *
                            (direction === "in" ? 1.2 : 1 / 1.2),
                        ),
                      ),
                    },
                  });
              }}
            />
            {doc && (
              <ViewportDeckControl
                doc={doc}
                deckId={view.deckId}
                onChange={(deckId) => {
                  updateView({ deckId });
                  select([]);
                }}
              />
            )}
            {doc ? (
              <LayoutCanvas
                sharedViewport={sharedViewport}
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
                gesture={(g) => applyLayoutGesture(g, panelContext)}
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
          <PanelResizeHandle
            side="right"
            width={view.rightWidth}
            onResize={(width) => updateView({ rightWidth: width })}
          />
          <LayoutInspector {...panelContext} />
        </div>
      )}
      <footer className="layout-statusbar">
        <button
          className="canvas-space-toggle"
          aria-label={canvasOnly ? "Exit canvas focus" : "Maximize canvas"}
          aria-pressed={canvasOnly}
          onClick={() => setCanvasOnly((v) => !v)}
        >
          {canvasOnly ? "Exit focus" : "Focus canvas"}
        </button>
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
        <NewLayoutDialog
          editor={editor}
          onClose={() => setNewDialog(false)}
          onResetSelection={resetWorkspace}
          inspectWayfarer={inspectWayfarer}
        />
      )}
    </main>
  );
}
