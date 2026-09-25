import { type FloorStamp } from "./floor-stamps";
import { deleteLayoutSelection } from "./selection-deletion";
import type { PartAsset, PartCatalog } from "@sidereal/content/assembly";
import { assemblyMismatches } from "@sidereal/content/layout-assembly";
import {
  type LayoutDocument,
  type Point,
  type ServiceChannel,
} from "@sidereal/content/ship-layout";
import { positiveOverlap } from "@sidereal/sim/layout-geometry";
import { assertHullEnvelopeFits } from "@sidereal/sim/layout-structure";
import { ModeTabs, PanelResizeHandle } from "@sidereal/ui/editor-controls";
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
import { LayerVisibility } from "./LayerVisibility";
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
const modes = ["Structure", "Objects", "Hull", "Systems"] as const;
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
    [shape, setShape] = useState<FloorStamp>("native:square-2m"),
    [turns, setTurns] = useState(0),
    [mirrorX, setMirrorX] = useState(false),
    [mirrorY, setMirrorY] = useState(false),
    [search, setSearch] = useState(""),
    [roomType, setRoomType] = useState("Lounge"),
    [channel, setChannel] = useState<ServiceChannel>("power"),
    [asset, setAsset] = useState<PartAsset>(),
    [catalog, setCatalog] = useState<PartCatalog>(),
    [catalogError, setCatalogError] = useState(""),
    [inspector, setInspector] = useState<"Inspector" | "Validation">(
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
    }));
  }
  function redesignCurrent() {
    if (editor.createFloorplanFromCurrent()) resetWorkspace();
  }

  const shell = useRef<HTMLElement>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/assets/assembly/catalog-shipyard-r005.json")
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
  /** Design-tool clipboard: Ctrl+C remembers entity IDs, Ctrl+V duplicates them. */
  const clipboard = useRef<string[]>([]);
  /** Every entity on the active deck, for Select All. */
  function deckEntityIds(): string[] {
    if (!doc) return [];
    const onDeck = (e: { id: string; deckId: string }) =>
      e.deckId === view.deckId;
    if (view.mode === "Structure")
      return [
        ...doc.tiles.filter(onDeck),
        ...doc.partitions.filter(onDeck),
        ...doc.openings.filter(onDeck),
        ...doc.rooms.filter(onDeck),
      ].map((entity) => entity.id);
    if (view.mode === "Systems")
      return doc.routes.filter(onDeck).map((route) => route.id);
    return [
      ...doc.tiles.filter(onDeck),
      ...doc.partitions.filter(onDeck),
      ...doc.openings.filter(onDeck),
      ...doc.fittings.filter(onDeck),
      ...doc.routes.filter(onDeck),
      ...doc.rooms.filter(onDeck),
    ].map((e) => e.id);
  }
  function transform(
    action: "rotate" | "mirror-x" | "mirror-y" | "copy" | "move",
    delta: Point = [0, 0],
    times = 1,
    ids: string[] = selection,
  ) {
    if (!ids.length) return;
    let created: string[] = [];
    if (action === "copy" && doc) {
      // Land the duplicate on free floor: the first offset whose copied tiles
      // clear every other tile on the deck, so a duplicate never starts invalid.
      const chosen = doc.tiles.filter((t) => ids.includes(t.id));
      const others = doc.tiles.filter(
        (t) => !ids.includes(t.id) && chosen.some((c) => c.deckId === t.deckId),
      );
      const candidates: Point[] = [
        delta,
        [0, 64],
        [-64, 0],
        [0, -64],
        [128, 0],
        [0, 128],
      ];
      const clear = candidates.find(
        ([dx, dy]) =>
          !chosen.some((c) =>
            others.some(
              (t) =>
                t.deckId === c.deckId &&
                positiveOverlap(
                  t.vertices,
                  c.vertices.map(([x, y]) => [x + dx, y + dy] as Point),
                ),
            ),
          ),
      );
      if (clear) delta = clear;
    }
    commit((d) => {
      let next = d;
      for (let i = 0; i < times; i++)
        next = transformTiles(next, ids, action, delta, uuid);
      next.fittings = next.fittings.flatMap((f) => {
        if (!ids.includes(f.id)) return [f];
        const q = { ...f };
        if (action === "rotate") q.quarterTurns = (q.quarterTurns + times) % 4;
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
      if (action === "copy") {
        const before = new Set(
          [...d.tiles, ...d.partitions, ...d.openings, ...d.fittings].map(
            (e) => e.id,
          ),
        );
        created = [
          ...next.tiles,
          ...next.partitions,
          ...next.openings,
          ...next.fittings,
        ]
          .map((e) => e.id)
          .filter((id) => !before.has(id));
      }
      return next;
    });
    // Like other design tools, a duplicate becomes the new selection so it can
    // be nudged into place immediately.
    if (action === "copy" && created.length) select(created);
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
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"],dialog',
        ) ||
        newDialog
      )
        return;
      if (e.key === "Escape") setCanvasOnly(false);
      const mod = e.ctrlKey || e.metaKey;
      if (
        (view.mode === "Hull" || view.mode === "Objects") &&
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
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        select(deckEntityIds());
      } else if (mod && e.key.toLowerCase() === "d") {
        // Ctrl+D deselects (owner convention); Ctrl+Shift+D duplicates.
        e.preventDefault();
        if (e.shiftKey) transform("copy", [64, 0]);
        else select([]);
      } else if (mod && e.key.toLowerCase() === "c") {
        if (!selection.length) return;
        e.preventDefault();
        clipboard.current = [...selection];
      } else if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        transform("copy", [64, 0], 1, clipboard.current);
      } else if (e.key.toLowerCase() === "r") {
        // R turns clockwise, Shift+R counter-clockwise.
        const step = e.shiftKey ? 3 : 1;
        selection.length
          ? transform("rotate", [0, 0], step)
          : setTurns((t) => (t + step) % 4);
      } else if (e.key.toLowerCase() === "f") {
        transform(e.shiftKey ? "mirror-y" : "mirror-x");
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
      if (["stamp", "fill", "partition", "door", "hole", "room"].includes(next))
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
        <div className="layout-projection">
          {view.mode === "Structure" ? (
            <span
              className="layout-projection-lock"
              title="Structure editing uses a fixed top-down orthographic working plane"
            >
              Top · orthographic
            </span>
          ) : (
            <ModeTabs
              label="Projection"
              values={projections}
              value={view.projection}
              onChange={(projection) => {
                updateView({ projection });
                cancel();
              }}
            />
          )}
        </div>
      </div>
      <LayerVisibility
        layers={view.layers}
        onChange={(layers) => updateView({ layers })}
      />
      {!!doc?.assembly?.parts.length &&
        doc.structure?.schema !== "sidereal.layout-structure.v2" && (
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
              {editor.busy ? "Validating…" : `${errors} layout errors`} ·{" "}
              {doc?.tiles.length ?? 0} tiles
            </>
          )}
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
