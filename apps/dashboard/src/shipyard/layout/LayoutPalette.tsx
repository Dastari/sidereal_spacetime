import { PressureAreas } from "./PressureAreas";
import {
  FLOOR_SHAPES,
  SERVICE_CHANNELS,
  type ServiceChannel,
  type Shape,
} from "@sidereal/content/ship-layout";
import { setHullEnvelope } from "@sidereal/sim/layout-structure";
import { EditorSection, PropertyField } from "@sidereal/ui/editor-controls";
import { Box, Layers, Plus, Search } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { HullSizePanel } from "./HullSizePanel";
import type { LayoutPanelContext } from "./panel-context";
import { DOOR_WIDTHS } from "./structural-edits";
import { uuid } from "./useLayout";
import {
  selectedInternalWall,
  deleteInternalWall,
  deleteRoomLabel,
} from "./panel-deletion";
const ConstructionPanel = lazy(
  () => import("../../authoring/ConstructionPanel"),
);
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
export function LayoutPalette(props: LayoutPanelContext) {
  const [showWorkflow, setShowWorkflow] = useState(false);
  const {
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
  } = props;
  const internalWall = doc
    ? selectedInternalWall(doc, result, props.selectedWallKey ?? selection[0])
    : undefined;
  return (
    <aside
      className="layout-left"
      aria-label="Decks and asset palette"
      hidden={!showLeft}
    >
      <PropertyField label="Deck">
        <select
          aria-label="Palette active deck"
          value={view.deckId}
          onChange={(e) => {
            updateView({ deckId: e.target.value });
            select([]);
          }}
        >
          {doc?.decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </PropertyField>
      <details className="editor-disclosure">
        <summary>Manage decks · {doc?.decks.length ?? 0}</summary>
        <EditorSection title="Decks">
          {doc?.decks.map((deck) => (
            <button
              className="layout-deck"
              key={deck.id}
              aria-pressed={view.deckId === deck.id}
              onClick={() => {
                updateView({ deckId: deck.id });
                select([]);
              }}
            >
              <Layers size={17} />
              <span>
                {deck.name}
                <small>
                  {deck.id === doc.playableDeckId
                    ? "Playable plane"
                    : "Authoring only"}{" "}
                  · {(deck.elevation / 32).toFixed(1)} m
                </small>
              </span>
              <svg viewBox="-90 -210 760 430" aria-hidden="true">
                {doc.tiles
                  .filter((t) => t.deckId === deck.id)
                  .map((t) => (
                    <polygon
                      key={t.id}
                      points={t.vertices
                        .map(([x, y]) => `${x},${-y}`)
                        .join(" ")}
                    />
                  ))}
              </svg>
            </button>
          ))}
          <button
            className="layout-wide"
            disabled={blocked || (doc?.decks.length ?? 0) >= 8}
            onClick={() => {
              const id = uuid();
              commit((d) => ({
                ...d,
                decks: [
                  ...d.decks,
                  {
                    id,
                    name: `Deck ${String.fromCharCode(65 + d.decks.length)}`,
                    order: d.decks.length,
                    elevation: d.decks.length * 128,
                    ceiling: 96,
                    roof: true,
                    holes: [],
                  },
                ],
              }));
              updateView({ deckId: id });
            }}
          >
            <Plus size={16} /> Add deck
          </button>
        </EditorSection>
      </details>
      <EditorSection
        title={
          view.mode === "Structure"
            ? "Structural tiles"
            : view.mode === "Rooms"
              ? "Walls & rooms"
              : view.mode === "Systems"
                ? "Service channels"
                : view.mode === "Hull"
                  ? "Hull & exterior"
                  : "Visual references"
        }
      >
        <div className="layout-search">
          <Search size={15} />
          <input
            aria-label="Search palette"
            placeholder="Search palette…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {view.mode === "Structure" && (
          <>
            <div className="layout-palette">
              {Object.entries(FLOOR_SHAPES)
                .filter(([, s]) =>
                  s.label.toLowerCase().includes(search.toLowerCase()),
                )
                .map(([key, s]) => (
                  <button
                    key={key}
                    draggable={!blocked}
                    onDragStart={(e) =>
                      e.dataTransfer.setData(
                        "application/sidereal-layout",
                        JSON.stringify({ shape: key }),
                      )
                    }
                    aria-pressed={shape === key && tool === "stamp"}
                    onClick={() => {
                      setShape(key as Shape);
                      setTool("stamp");
                    }}
                    disabled={blocked}
                  >
                    <svg viewBox="-8 -8 80 80" aria-hidden="true">
                      <polygon
                        points={s.vertices.map((p) => p.join(",")).join(" ")}
                      />
                    </svg>
                    <span>{s.label}</span>
                  </button>
                ))}
            </div>
            <button
              className="layout-wide"
              disabled={blocked}
              aria-pressed={tool === "fill"}
              onClick={() => setTool("fill")}
            >
              Area / line fill
            </button>
            <button
              className="layout-wide"
              disabled={blocked}
              aria-pressed={tool === "hole"}
              onClick={() => setTool("hole")}
            >
              Declare courtyard / shaft void
            </button>
            <p className="layout-note">
              Walls enclose the floor union automatically. Shared edges produce
              no exterior wall.
            </p>
          </>
        )}
        {view.mode === "Rooms" && (
          <>
            <button
              className="layout-wide"
              disabled={blocked}
              aria-pressed={tool === "partition"}
              onClick={() => setTool("partition")}
            >
              Draw internal wall
            </button>
            <div className="layout-tool-actions">
              <button
                disabled={blocked}
                aria-pressed={tool === "select"}
                onClick={() => setTool("select")}
              >
                Select wall / room
              </button>
              <button
                disabled={blocked || !internalWall}
                onClick={() => {
                  if (internalWall) {
                    commit((d) => deleteInternalWall(d, internalWall.id));
                    select([]);
                  }
                }}
              >
                Delete internal wall
              </button>
              <button
                disabled={blocked || !selectedRoom}
                onClick={() => {
                  if (selectedRoom) {
                    commit((d) => deleteRoomLabel(d, selectedRoom.id));
                    select([]);
                  }
                }}
              >
                Delete room label
              </button>
            </div>

            <button
              className="layout-wide"
              disabled={blocked || !doc?.structure}
              aria-pressed={tool === "door"}
              onClick={() => setTool("door")}
            >
              Place door opening
            </button>
            <details
              className="editor-disclosure"
              open={tool === "door" ? true : undefined}
            >
              <summary>Door settings</summary>
              <PropertyField label="Door width" unit="m">
                <select
                  aria-label="New door width"
                  value={editor.structuralTools.doorWidth}
                  onChange={(e) =>
                    editor.setStructuralTools({
                      doorWidth: Number(e.target.value),
                    })
                  }
                >
                  {DOOR_WIDTHS.map((w) => (
                    <option value={w} key={w}>
                      {w / 32}
                    </option>
                  ))}
                </select>
              </PropertyField>
              <PropertyField label="Door type">
                <select
                  aria-label="New door type"
                  value={editor.structuralTools.doorKind}
                  onChange={(e) =>
                    editor.setStructuralTools({
                      doorKind: e.target.value as
                        "door" | "passage" | "airlock",
                    })
                  }
                >
                  <option value="door">Sealing door</option>
                  <option value="passage">Open passage</option>
                  <option value="airlock">Airlock opening</option>
                </select>
              </PropertyField>
            </details>
            {doc && result && (
              <PressureAreas
                doc={doc}
                result={result}
                deckId={view.deckId}
                enabled={view.layers.pressure !== false}
                onToggle={(pressure) =>
                  updateView({ layers: { ...view.layers, pressure } })
                }
              />
            )}
            <PropertyField label="Room label">
              <select
                aria-label="Room label type"
                value={roomType}
                onChange={(e) => setRoomType(e.target.value)}
              >
                {roomTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </PropertyField>
            <button
              className="layout-wide"
              disabled={blocked}
              aria-pressed={tool === "room"}
              onClick={() => setTool("room")}
            >
              Place room label
            </button>
            <details className="editor-disclosure">
              <summary>Wall rules & grid</summary>
              {doc?.structure && (
                <PropertyField label="Wall edge subdivision" unit="m">
                  <select
                    aria-label="Wall edge subdivision"
                    disabled={blocked}
                    value={doc.structure.grid}
                    onChange={(e) =>
                      commit((d) =>
                        setHullEnvelope(
                          {
                            ...d,
                            structure: {
                              ...d.structure!,
                              grid: Number(e.target.value) as 16 | 32 | 64,
                            },
                          },
                          d.structure!.hull,
                        ),
                      )
                    }
                  >
                    {[16, 32, 64].map((g) => (
                      <option key={g} value={g}>
                        {g / 32}
                      </option>
                    ))}
                  </select>
                </PropertyField>
              )}
              <p className="layout-note">
                Rendered r004 walls are centred: 93.75 mm core, 125 mm
                decorative envelope. Exterior outward-only walls and qualified
                armor mounts are a separate fitting requirement. Internal walls
                follow grid edges. Doors snap to wall slots with space for their
                jambs and approaches. Exterior walls follow the floor plan and
                cannot be deleted separately. Room labels do not remove floors,
                walls or objects.
              </p>
            </details>
          </>
        )}
        {view.mode === "Systems" && (
          <>
            {Object.entries(SERVICE_CHANNELS)
              .filter(([name]) => name.includes(search.toLowerCase()))
              .map(([name, s]) => (
                <button
                  key={name}
                  className="layout-channel"
                  disabled={blocked}
                  aria-pressed={channel === name}
                  onClick={() => {
                    setChannel(name as ServiceChannel);
                    setTool("route");
                  }}
                >
                  <i style={{ background: s.color }} />
                  {name}
                  <small>{s.unit}</small>
                </button>
              ))}
            <label className="layout-check">
              <input
                type="checkbox"
                checked={reuseNodes}
                onChange={(e) => setReuseNodes(e.target.checked)}
              />{" "}
              Explicitly reuse matching endpoints
            </label>
            <p className="layout-note">
              Drag to route along the floor. Same-channel crossings remain
              disconnected unless endpoints share a junction ID.
            </p>
            <details className="editor-disclosure">
              <summary>Systems scope</summary>
              <p className="layout-note">
                Routes record design intent. This editor does not run the power
                or fluid simulation.
              </p>
            </details>
          </>
        )}
        {view.mode === "Hull" && (
          <>
            <p className="layout-note">
              Orthographic views share the same enclosure. Construction and skin
              adapters await approved Blender definitions.
            </p>
            <details className="editor-disclosure">
              <summary>Available exterior tools</summary>
              <p className="layout-note">
                Panel, armor, glazing and mount authoring need qualified native
                adapters. Existing Blender assemblies remain available for
                review.
              </p>
            </details>
            <a className="layout-wide" href="/shipyard?assembly=legacy">
              Review existing Blender assembly
            </a>
          </>
        )}
        {view.mode === "Objects" && (
          <>
            <h3>Placeable visual references</h3>
            {catalogError && <p className="layout-note">{catalogError}</p>}
            <div className="layout-palette">
              {catalog?.assets
                .filter(
                  (a) =>
                    (a.category === "equipment" || a.category === "cargo") &&
                    a.label.toLowerCase().includes(search.toLowerCase()),
                )
                .map((a) => (
                  <button
                    key={a.id}
                    disabled={blocked}
                    aria-pressed={asset?.id === a.id && tool === "object"}
                    draggable={!blocked}
                    onDragStart={(e) =>
                      e.dataTransfer.setData(
                        "application/sidereal-layout",
                        JSON.stringify({ assetId: a.id }),
                      )
                    }
                    onClick={() => {
                      setAsset(a);
                      setTool("object");
                    }}
                  >
                    {a.thumbnail ? (
                      <img
                        src={a.thumbnail}
                        alt=""
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <Box size={26} />
                    )}
                    <span>{a.label}</span>
                    <small>
                      {a.visual ? "Native Blender" : "Legacy reference"}
                    </small>
                  </button>
                ))}
            </div>
            <p className="layout-note">
              Catalog bounds provide a draft footprint only. Mounts, cargo
              ratings and functional installation await authored definitions.
            </p>
          </>
        )}
      </EditorSection>
      {view.mode === "Structure" && doc && (
        <HullSizePanel
          editor={editor}
          doc={doc}
          blocked={blocked}
          apply={(hull) => commit((d) => setHullEnvelope(d, hull))}
        />
      )}
      <details
        className="editor-disclosure"
        onToggle={(e) => setShowWorkflow(e.currentTarget.open)}
      >
        <summary>Account & construction workflows</summary>
        <EditorSection title="Separate workflows">
          {showWorkflow && (
            <Suspense
              fallback={<p role="status">Loading construction tools…</p>}
            >
              <ConstructionPanel
                doc={doc}
                onLoad={(d) => editor.adoptServer(d)}
              />
            </Suspense>
          )}
          <button
            className="layout-wide"
            onClick={editor.save}
            disabled={blocked}
          >
            Save local draft
          </button>
          {["Apply live refit", "Capture live to draft"].map((t) => (
            <button
              key={t}
              className="layout-wide"
              disabled
              title="Requires future private authority service and capability checks"
            >
              {t} · unavailable
            </button>
          ))}
          <p className="layout-note">
            Blueprint publication is separate from installation. Live refit and
            capture require their own authorized transactions.
          </p>
        </EditorSection>
      </details>
    </aside>
  );
}
