import ConstructionPanel from "../../authoring/ConstructionPanel";
import { Box, Layers, Plus, Search } from "lucide-react";
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
import type { CompiledLayout } from "../../../../../packages/sim/src/layout-compiler";
import {
  ModeTabs,
  PropertyField,
  EditorSection,
  ValidationList,
} from "../../../../../packages/ui/src/editor-controls";
import type { Tool } from "./LayoutCanvas";
import type { ViewState } from "./state";
import { useLayout, uuid } from "./useLayout";
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
export interface LayoutPanelContext {
  editor: ReturnType<typeof useLayout>;
  doc: LayoutDocument | null;
  result: CompiledLayout | undefined;
  view: ViewState;
  blocked: boolean;
  showLeft: boolean;
  showRight: boolean;
  selection: string[];
  select: (ids: string[]) => void;
  updateView: (value: Partial<ViewState>) => void;
  commit: (change: (doc: LayoutDocument) => LayoutDocument) => void;
  search: string;
  setSearch: (value: string) => void;
  shape: Shape;
  setShape: (value: Shape) => void;
  tool: Tool;
  setTool: (value: Tool) => void;
  roomType: string;
  setRoomType: (value: string) => void;
  channel: ServiceChannel;
  setChannel: (value: ServiceChannel) => void;
  reuseNodes: boolean;
  setReuseNodes: (value: boolean) => void;
  catalog: PartCatalog | undefined;
  catalogError: string;
  asset: PartAsset | undefined;
  setAsset: (asset: PartAsset) => void;
  inspector: "Inspector" | "Layers" | "Validation";
  setInspector: (value: "Inspector" | "Layers" | "Validation") => void;
  selectedTile: LayoutDocument["tiles"][number] | undefined;
  selectedRoom: LayoutDocument["rooms"][number] | undefined;
  selectedPartition: LayoutDocument["partitions"][number] | undefined;
  selectedOpening: LayoutDocument["openings"][number] | undefined;
  selectedFitting: LayoutDocument["fittings"][number] | undefined;
  selectedRoute: LayoutDocument["routes"][number] | undefined;
  changeSelected: (
    key: "rooms" | "partitions" | "openings" | "fittings" | "routes",
    change: Record<string, unknown>,
  ) => void;
  turns: number;
  setTurns: (value: number) => void;
  mirrorX: boolean;
  setMirrorX: (value: boolean) => void;
  mirrorY: boolean;
  setMirrorY: (value: boolean) => void;
  metrics: { length: number; width: number } | null;
  errors: number;
  transform: (
    action: "rotate" | "mirror-x" | "mirror-y" | "copy" | "move",
    delta?: Point,
  ) => void;
}

export function LayoutPalette(props: LayoutPanelContext) {
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
  return (
    <aside
      className="layout-left"
      aria-label="Decks and asset palette"
      hidden={!showLeft}
    >
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
                    points={t.vertices.map(([x, y]) => `${x},${-y}`).join(" ")}
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
      <EditorSection
        title={
          view.mode === "Structure"
            ? "Structural tiles"
            : view.mode === "Rooms"
              ? "Room types"
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
                    <small>2 m module · draft</small>
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
            <div className="layout-room-types">
              {roomTypes
                .filter((t) => t.toLowerCase().includes(search.toLowerCase()))
                .map((t) => (
                  <button
                    key={t}
                    disabled={blocked}
                    aria-pressed={roomType === t && tool === "room"}
                    onClick={() => {
                      setRoomType(t);
                      setTool("room");
                    }}
                  >
                    <Box size={19} />
                    {t}
                  </button>
                ))}
            </div>
            <button
              className="layout-wide"
              disabled={blocked}
              aria-pressed={tool === "partition"}
              onClick={() => setTool("partition")}
            >
              Draw partition
            </button>
            <button
              className="layout-wide"
              disabled={blocked}
              aria-pressed={tool === "door"}
              onClick={() => setTool("door")}
            >
              Reserve door opening
            </button>
            <p className="layout-note">
              Draw partitions along tile boundaries. Room seeds select connected
              floor regions; door sweeps reserve both approaches.
            </p>
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
            <button
              className="layout-wide"
              disabled
              title="Stage 5 solver is not implemented"
            >
              Simulate systems · unavailable
            </button>
          </>
        )}
        {view.mode === "Hull" && (
          <>
            <p className="layout-note">
              Orthographic views share the same enclosure. Construction and skin
              adapters await approved Blender definitions.
            </p>
            {[
              "Hull panels",
              "Armor plates",
              "Windows",
              "Exterior trim",
              "Decals & markings",
              "Faction style kits",
              "Hardpoints & mounts",
            ]
              .filter((t) => t.toLowerCase().includes(search.toLowerCase()))
              .map((t) => (
                <button className="layout-wide" disabled key={t}>
                  {t} · unassigned
                </button>
              ))}
            <a className="layout-wide" href="/shipyard?assembly=legacy">
              Review existing Blender assembly
            </a>
          </>
        )}
        {(view.mode === "Objects" || view.mode === "Rooms") && (
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
      <EditorSection title="Separate workflows">
        <ConstructionPanel doc={doc} onLoad={d=>editor.adoptServer(d)} />
        <button
          className="layout-wide"
          onClick={editor.save}
          disabled={blocked}
        >
          Save local draft
        </button>
        {["Apply live refit", "Capture live to draft"].map(
          (t) => (
            <button
              key={t}
              className="layout-wide"
              disabled
              title="Requires future private authority service and capability checks"
            >
              {t} · unavailable
            </button>
          ),
        )}
        <p className="layout-note">
          Blueprint publication is separate from installation. Live refit and capture require their own authorized transactions.
        </p>
      </EditorSection>
    </aside>
  );
}

export function LayoutInspector(props: LayoutPanelContext) {
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
  return (
    <aside
      className="layout-right"
      aria-label="Layout inspector"
      hidden={!showRight}
    >
      <ModeTabs
        label="Inspector tabs"
        values={["Inspector", "Layers", "Validation"] as const}
        value={inspector}
        onChange={setInspector}
      />
      {inspector === "Layers" ? (
        <EditorSection title="Visible layers">
          {Object.entries(view.layers).map(([name, enabled]) => (
            <label className="layout-check" key={name}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) =>
                  updateView({
                    layers: { ...view.layers, [name]: e.target.checked },
                  })
                }
              />
              {name}
            </label>
          ))}
          <p className="layout-note">
            Visibility is presentation only. Roof hiding grants no access and
            changes no collision.
          </p>
        </EditorSection>
      ) : inspector === "Validation" ? (
        <EditorSection title={`${errors} errors · design validation`}>
          <ValidationList
            items={result?.diagnostics ?? []}
            onSelect={(ids) => {
              select(ids);
            }}
          />
        </EditorSection>
      ) : (
        <>
          <EditorSection
            title={
              selectedRoom?.name ??
              (selectedOpening
                ? "Opening reservation"
                : selectedPartition
                  ? "Partition"
                  : selectedFitting
                    ? "Visual placement"
                    : selectedRoute
                      ? "Service route"
                      : selectedTile
                        ? "Floor tile"
                        : view.mode === "Hull"
                          ? "Exterior appearance"
                          : "Placement settings")
            }
          >
            {selection.length > 0 && (
              <p className="layout-id">
                {selection.length === 1
                  ? selection[0]
                  : `${selection.length} selected identities`}
              </p>
            )}
            {selectedRoom && (
              <>
                <PropertyField label="Room name">
                  <input
                    aria-label="Room name"
                    value={selectedRoom.name}
                    onChange={(e) =>
                      changeSelected("rooms", { name: e.target.value })
                    }
                  />
                </PropertyField>
                <PropertyField label="Room type">
                  <select
                    value={selectedRoom.type}
                    onChange={(e) =>
                      changeSelected("rooms", { type: e.target.value })
                    }
                  >
                    {roomTypes.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </PropertyField>
                <PropertyField label="Access design">
                  <select
                    value={selectedRoom.access}
                    onChange={(e) =>
                      changeSelected("rooms", { access: e.target.value })
                    }
                  >
                    <option value="crew">Crew</option>
                    <option value="visitors">Visitors</option>
                    <option value="restricted">Restricted</option>
                  </select>
                </PropertyField>
                <PropertyField label="Floor theme">
                  <input
                    value={selectedRoom.floorTheme}
                    onChange={(e) =>
                      changeSelected("rooms", {
                        floorTheme: e.target.value,
                      })
                    }
                  />
                </PropertyField>
                <PropertyField label="Wall theme">
                  <input
                    value={selectedRoom.wallTheme}
                    onChange={(e) =>
                      changeSelected("rooms", { wallTheme: e.target.value })
                    }
                  />
                </PropertyField>
                <dl>
                  <dt>Computed region area</dt>
                  <dd>
                    {result?.rooms
                      .find((r) => r.id === selectedRoom.id)
                      ?.area.toFixed(1) ?? "Unknown"}{" "}
                    m²
                  </dd>
                  <dt>Pressure / occupancy</dt>
                  <dd>Not simulated</dd>
                </dl>
                <p className="layout-note">
                  Access is a design policy reference, not a permission grant. A
                  label does not prove a seal.
                </p>
              </>
            )}
            {selectedOpening && (
              <>
                <PropertyField label="Opening kind">
                  <select
                    value={selectedOpening.kind}
                    onChange={(e) =>
                      changeSelected("openings", { kind: e.target.value })
                    }
                  >
                    <option value="door">Interior door</option>
                    <option value="passage">Open passage</option>
                    <option value="airlock">Airlock reservation</option>
                  </select>
                </PropertyField>
                <PropertyField label="Approach / sweep" unit="m">
                  <input
                    aria-label="Opening clearance"
                    type="number"
                    min=".5"
                    max="4"
                    step=".25"
                    value={selectedOpening.clearance / 32}
                    onChange={(e) =>
                      changeSelected("openings", {
                        clearance: Math.round(Number(e.target.value) * 32),
                      })
                    }
                  />
                </PropertyField>
                <dl>
                  <dt>Reserved width</dt>
                  <dd>
                    {Math.hypot(
                      selectedOpening.a[0] - selectedOpening.b[0],
                      selectedOpening.a[1] - selectedOpening.b[1],
                    ) / 32}{" "}
                    m
                  </dd>
                  <dt>Parent partition</dt>
                  <dd>{selectedOpening.partitionId}</dd>
                  <dt>Door / seal state</dt>
                  <dd>Not simulated</dd>
                </dl>
              </>
            )}
            {selectedPartition && (
              <>
                <PropertyField label="Boundary intent">
                  <select
                    value={selectedPartition.seal}
                    onChange={(e) =>
                      changeSelected("partitions", { seal: e.target.value })
                    }
                  >
                    <option value="design-sealed">Sealed design</option>
                    <option value="open-divider">Open divider</option>
                  </select>
                </PropertyField>
                <p className="layout-note">
                  Drawn on shared tile edges. Delete removes this partition and
                  its local opening reservations as one undoable command.
                </p>
              </>
            )}
            {selectedFitting && (
              <>
                <p>
                  {catalog?.assets.find(
                    (a) => a.id === selectedFitting.definitionId,
                  )?.label ?? "Missing catalog asset · retained"}
                </p>
                <PropertyField label="Local X" unit="m">
                  <input
                    type="number"
                    step=".5"
                    value={selectedFitting.position[0] / 32}
                    onChange={(e) =>
                      changeSelected("fittings", {
                        position: [
                          Math.round(Number(e.target.value) * 32),
                          selectedFitting.position[1],
                        ],
                      })
                    }
                  />
                </PropertyField>
                <PropertyField label="Local Y" unit="m">
                  <input
                    type="number"
                    step=".5"
                    value={selectedFitting.position[1] / 32}
                    onChange={(e) =>
                      changeSelected("fittings", {
                        position: [
                          selectedFitting.position[0],
                          Math.round(Number(e.target.value) * 32),
                        ],
                      })
                    }
                  />
                </PropertyField>
                <dl>
                  <dt>Physical footprint</dt>
                  <dd>
                    {selectedFitting.footprint
                      .map((n) => (n / 32).toFixed(2))
                      .join(" × ")}{" "}
                    m
                  </dd>
                  <dt>Mount / mass rating</dt>
                  <dd>Unverified</dd>
                </dl>
                {selectedFitting.container && (
                  <>
                    <h3>Container contents</h3>
                    <div
                      className="layout-container-grid"
                      style={{
                        gridTemplateColumns: `repeat(${selectedFitting.container.columns},1fr)`,
                      }}
                    >
                      {Array.from(
                        {
                          length:
                            selectedFitting.container.columns *
                            selectedFitting.container.rows,
                        },
                        (_, i) => (
                          <span key={i} />
                        ),
                      )}
                    </div>
                    <p className="layout-note">
                      Empty blueprint container. Proposed internal grid:{" "}
                      {selectedFitting.container.columns} ×{" "}
                      {selectedFitting.container.rows} cells. This grid is
                      separate from the physical deck footprint; no live items
                      or liquid quantities are copied.
                    </p>
                  </>
                )}
              </>
            )}
            {selectedRoute && (
              <>
                <PropertyField label="Channel">
                  <output>{selectedRoute.channel}</output>
                </PropertyField>
                <PropertyField
                  label="Declared capacity"
                  unit={SERVICE_CHANNELS[selectedRoute.channel].unit}
                >
                  <input
                    aria-label="Route capacity"
                    type="number"
                    placeholder="Unknown"
                    min="1"
                    value={selectedRoute.capacity ?? ""}
                    onChange={(e) =>
                      changeSelected("routes", {
                        capacity: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </PropertyField>
                <dl>
                  <dt>From node</dt>
                  <dd>{selectedRoute.from}</dd>
                  <dt>To node</dt>
                  <dd>{selectedRoute.to}</dd>
                  <dt>Supply / load</dt>
                  <dd>Not simulated</dd>
                  <dt>Explicit graph components</dt>
                  <dd>
                    {
                      result?.routeComponents.filter(
                        (c) => c.channel === selectedRoute.channel,
                      ).length
                    }
                  </dd>
                </dl>
              </>
            )}
            {selectedTile && (
              <>
                <PropertyField label="Replace tile shape">
                  <select
                    aria-label="Replace tile shape"
                    value={selectedTile.shape}
                    onChange={(e) =>
                      commit((d) => ({
                        ...d,
                        tiles: d.tiles.map((t) =>
                          t.id === selectedTile.id
                            ? stampTile(
                                t.id,
                                t.deckId,
                                e.target.value as Shape,
                                [
                                  Math.min(...t.vertices.map((p) => p[0])),
                                  Math.min(...t.vertices.map((p) => p[1])),
                                ],
                                turns,
                              )
                            : t,
                        ),
                      }))
                    }
                  >
                    {Object.entries(FLOOR_SHAPES).map(([key, s]) => (
                      <option key={key} value={key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </PropertyField>
                <p className="layout-note">
                  Replacement retains the selected tile ID. Other placements
                  remain intact; conflicts are reported.
                </p>
                <PropertyField label="Minimum X" unit="m">
                  <input
                    aria-label="Tile X"
                    type="number"
                    step=".5"
                    value={
                      Math.min(...selectedTile.vertices.map((p) => p[0])) / 32
                    }
                    onChange={(e) =>
                      transform("move", [
                        Math.round(Number(e.target.value) * 32) -
                          Math.min(...selectedTile.vertices.map((p) => p[0])),
                        0,
                      ])
                    }
                  />
                </PropertyField>
                <PropertyField label="Minimum Y" unit="m">
                  <input
                    aria-label="Tile Y"
                    type="number"
                    step=".5"
                    value={
                      Math.min(...selectedTile.vertices.map((p) => p[1])) / 32
                    }
                    onChange={(e) =>
                      transform("move", [
                        0,
                        Math.round(Number(e.target.value) * 32) -
                          Math.min(...selectedTile.vertices.map((p) => p[1])),
                      ])
                    }
                  />
                </PropertyField>
              </>
            )}
            {!selectedRoom &&
              !selectedOpening &&
              !selectedPartition &&
              !selectedFitting &&
              !selectedRoute && (
                <>
                  <PropertyField label="Stamp rotation">
                    <select
                      aria-label="Stamp rotation"
                      value={turns}
                      onChange={(e) => setTurns(Number(e.target.value))}
                    >
                      {[0, 1, 2, 3].map((t) => (
                        <option key={t} value={t}>
                          {t * 90}°
                        </option>
                      ))}
                    </select>
                  </PropertyField>
                  <PropertyField label="Snap grid">
                    <select
                      aria-label="Snap grid"
                      value={view.grid}
                      onChange={(e) =>
                        updateView({ grid: Number(e.target.value) })
                      }
                    >
                      <option value="64">2 m</option>
                      <option value="32">1 m</option>
                      <option value="16">0.5 m</option>
                      <option value="1">1/32 m</option>
                    </select>
                  </PropertyField>
                  <label className="layout-check">
                    <input
                      type="checkbox"
                      checked={mirrorX}
                      onChange={(e) => setMirrorX(e.target.checked)}
                    />{" "}
                    Symmetry across X = 0
                  </label>
                  <label className="layout-check">
                    <input
                      type="checkbox"
                      checked={mirrorY}
                      onChange={(e) => setMirrorY(e.target.checked)}
                    />{" "}
                    Symmetry across Y = 0
                  </label>
                </>
              )}
          </EditorSection>
          {view.mode === "Hull" && doc && (
            <EditorSection title="Draft appearance">
              <PropertyField label="Primary">
                <input
                  type="color"
                  aria-label="Primary appearance color"
                  value={doc.appearance.primary}
                  onChange={(e) =>
                    commit((d) => ({
                      ...d,
                      appearance: {
                        ...d.appearance,
                        primary: e.target.value,
                      },
                    }))
                  }
                />
              </PropertyField>
              <PropertyField label="Accent">
                <input
                  type="color"
                  aria-label="Accent appearance color"
                  value={doc.appearance.accent}
                  onChange={(e) =>
                    commit((d) => ({
                      ...d,
                      appearance: {
                        ...d.appearance,
                        accent: e.target.value,
                      },
                    }))
                  }
                />
              </PropertyField>
              <p className="layout-note">
                Proxy colors only. No armor, damage or pressure values are
                changed. Approved faction skin adapters are unassigned.
              </p>
            </EditorSection>
          )}
          <EditorSection title="Design dimensions">
            <dl>
              <dt>Length × width</dt>
              <dd>
                {metrics
                  ? `${metrics.length.toFixed(1)} × ${metrics.width.toFixed(1)} m`
                  : "—"}
              </dd>
              <dt>Floor area, all decks</dt>
              <dd>{result?.area.toFixed(1) ?? "—"} m²</dd>
              <dt>Active deck tiles</dt>
              <dd>
                {doc?.tiles.filter((t) => t.deckId === view.deckId).length ?? 0}
              </dd>
              <dt>Enclosure spans</dt>
              <dd>
                {result?.walls.filter(
                  (w) => w.deckId === view.deckId && w.source === "perimeter",
                ).length ?? 0}
              </dd>
              <dt>Named rooms</dt>
              <dd>
                {doc?.rooms.filter((r) => r.deckId === view.deckId).length ?? 0}
              </dd>
              <dt>Mass / life support</dt>
              <dd>Unknown</dd>
            </dl>
          </EditorSection>
          <EditorSection title="Active deck">
            {doc && (
              <>
                <PropertyField label="Deck name">
                  <input
                    aria-label="Deck name"
                    value={
                      doc.decks.find((d) => d.id === view.deckId)?.name ?? ""
                    }
                    onChange={(e) =>
                      commit((d) => ({
                        ...d,
                        decks: d.decks.map((deck) =>
                          deck.id === view.deckId
                            ? { ...deck, name: e.target.value }
                            : deck,
                        ),
                      }))
                    }
                  />
                </PropertyField>
                <PropertyField label="Ceiling" unit="m">
                  <input
                    aria-label="Ceiling height"
                    type="number"
                    min="1"
                    max="16"
                    step=".5"
                    value={
                      (doc.decks.find((d) => d.id === view.deckId)?.ceiling ??
                        96) / 32
                    }
                    onChange={(e) =>
                      commit((d) => ({
                        ...d,
                        decks: d.decks.map((deck) =>
                          deck.id === view.deckId
                            ? {
                                ...deck,
                                ceiling: Math.round(
                                  Number(e.target.value) * 32,
                                ),
                              }
                            : deck,
                        ),
                      }))
                    }
                  />
                </PropertyField>
                <button
                  className="layout-wide"
                  disabled={blocked || doc.playableDeckId === view.deckId}
                  onClick={() =>
                    commit((d) => ({ ...d, playableDeckId: view.deckId }))
                  }
                >
                  Designate playable plane
                </button>
                <p className="layout-note">
                  Additional decks are authored reservations. Vertical traversal
                  is not implemented.
                </p>
              </>
            )}
          </EditorSection>
          <EditorSection title="Validation">
            <button
              className="layout-wide"
              onClick={() => setInspector("Validation")}
            >
              {editor.busy || !result
                ? "Validation pending"
                : errors
                  ? `${errors} errors to resolve`
                  : "Floor topology valid"}{" "}
              · inspect diagnostics
            </button>
            <p className="layout-note">
              {editor.busy
                ? "Validating in worker…"
                : `Compiler ${editor.milliseconds.toFixed(1)} ms`}
              <br />
              Enclosure render uses labeled draft proxies.
            </p>
          </EditorSection>
        </>
      )}
    </aside>
  );
}
