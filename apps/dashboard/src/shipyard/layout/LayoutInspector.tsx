import {
  FLOOR_SHAPES,
  SERVICE_CHANNELS,
  stampTile,
  type Shape,
} from "@sidereal/content/ship-layout";
import { floorModelOptions } from "@sidereal/sim/layout-native-floor";
import { setFloorStyle, setWallFace } from "@sidereal/sim/layout-structure";
import {
  EditorSection,
  ModeTabs,
  PropertyField,
  ValidationList,
} from "@sidereal/ui/editor-controls";
import type { LayoutPanelContext } from "./panel-context";
import { DOOR_WIDTHS, changeStructuralOpening } from "./structural-edits";
import {
  selectedInternalWall,
  deleteInternalWall,
  deleteRoomLabel,
} from "./panel-deletion";
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
  const wallKey = props.selectedWallKey ?? selection[0];
  const wallAnchor =
    result?.walls.find((w) => w.key === wallKey)?.anchorId ?? wallKey;
  const selectedWall = result?.structure?.walls.find(
    (w) => w.id === wallKey || w.anchorId === wallAnchor,
  );
  const internalWall = doc
    ? selectedInternalWall(doc, result, wallKey)
    : undefined;
  const floorStyle = selectedTile
    ? doc?.structure?.tileStyles[selectedTile.id]
    : undefined;
  const floorOptions = selectedTile
    ? floorModelOptions(
        selectedTile,
        doc?.decks.find((d) => d.id === selectedTile.deckId)?.elevation ?? 0,
      )
    : [];
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
                  ? "Internal wall"
                  : selectedFitting
                    ? "Visual placement"
                    : selectedRoute
                      ? "Service route"
                      : selectedTile
                        ? "Floor tile"
                        : view.mode === "Hull"
                          ? "Exterior appearance"
                          : selectedWall
                            ? selectedWall.source === "perimeter"
                              ? "Exterior wall"
                              : "Internal wall"
                            : "Placement settings")
            }
          >
            {selection.length > 0 && (
              <details className="editor-disclosure">
                <summary>Selection details</summary>
                <p className="layout-id">
                  {selection.length === 1
                    ? selection[0]
                    : `${selection.length} selected identities`}
                </p>
              </details>
            )}
            {internalWall && (
              <button
                className="layout-wide"
                disabled={blocked}
                onClick={() => {
                  commit((d) => deleteInternalWall(d, internalWall.id));
                  select([]);
                }}
              >
                Delete internal wall
              </button>
            )}
            {selectedWall && (
              <>
                <p className="layout-note">
                  {selectedWall.source === "perimeter"
                    ? "Generated from the floor plan. Edit the floor boundary to change this wall."
                    : "An internal wall edge. Its two faces can use different finishes."}
                </p>
                {(["left", "right"] as const).map((side) => (
                  <PropertyField
                    key={side}
                    label={`${side === "left" ? "Left" : "Right"} face finish`}
                  >
                    <input
                      key={`${selectedWall.anchorId}:${side}:${selectedWall.faces[side] ?? ""}`}
                      aria-label={`${side} wall face finish`}
                      disabled={blocked}
                      defaultValue={selectedWall.faces[side] ?? "standard"}
                      maxLength={128}
                      onBlur={(e) => {
                        if (
                          e.target.value !==
                          (selectedWall.faces[side] ?? "standard")
                        )
                          commit((d) =>
                            setWallFace(
                              d,
                              selectedWall.anchorId,
                              side,
                              e.target.value,
                            ),
                          );
                      }}
                    />
                  </PropertyField>
                ))}
                <details className="editor-disclosure">
                  <summary>Face orientation</summary>
                  <p className="layout-note">
                    Left and right follow the wall's A→B direction, independent
                    of the camera.
                  </p>
                </details>
                <button
                  className="layout-wide"
                  disabled={blocked}
                  onClick={() => setTool("door")}
                >
                  Place a door in this wall
                </button>
              </>
            )}
            {selectedRoom && (
              <>
                <button
                  className="layout-wide"
                  disabled={blocked}
                  onClick={() => {
                    commit((d) => deleteRoomLabel(d, selectedRoom.id));
                    select([]);
                  }}
                >
                  Delete room label
                </button>
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
                {doc?.structure && (
                  <PropertyField label="Door grid span" unit="m">
                    <select
                      aria-label="Selected door width"
                      disabled={blocked}
                      value={Math.max(
                        Math.abs(selectedOpening.b[0] - selectedOpening.a[0]),
                        Math.abs(selectedOpening.b[1] - selectedOpening.a[1]),
                      )}
                      onChange={(e) =>
                        commit((d) =>
                          changeStructuralOpening(d, selectedOpening.id, {
                            width: Number(e.target.value),
                          }),
                        )
                      }
                    >
                      {[
                        ...new Set([
                          ...DOOR_WIDTHS,
                          Math.max(
                            Math.abs(
                              selectedOpening.b[0] - selectedOpening.a[0],
                            ),
                            Math.abs(
                              selectedOpening.b[1] - selectedOpening.a[1],
                            ),
                          ),
                        ]),
                      ]
                        .sort((a, b) => a - b)
                        .map((w) => (
                          <option key={w} value={w}>
                            {w / 32}
                          </option>
                        ))}
                    </select>
                  </PropertyField>
                )}

                <PropertyField label="Opening kind">
                  <select
                    value={selectedOpening.kind}
                    onChange={(e) =>
                      doc?.structure
                        ? commit((d) =>
                            changeStructuralOpening(d, selectedOpening.id, {
                              kind: e.target.value as
                                "door" | "passage" | "airlock",
                            }),
                          )
                        : changeSelected("openings", { kind: e.target.value })
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
                      doc?.structure
                        ? commit((d) =>
                            changeStructuralOpening(d, selectedOpening.id, {
                              clearance: Math.round(
                                Number(e.target.value) * 32,
                              ),
                            }),
                          )
                        : changeSelected("openings", {
                            clearance: Math.round(Number(e.target.value) * 32),
                          })
                    }
                  />
                </PropertyField>
                {doc?.structure && (
                  <p className="layout-note">
                    Width is the grid span; diagonal openings have the longer
                    clear width shown below. Corner, junction and approach
                    clearance are checked on every edit.
                  </p>
                )}
                <button
                  className="layout-wide"
                  disabled={blocked}
                  onClick={() =>
                    commit((d) => ({
                      ...d,
                      openings: d.openings.filter(
                        (o) => o.id !== selectedOpening.id,
                      ),
                    }))
                  }
                >
                  Remove door opening
                </button>
                <dl>
                  <dt>Reserved width</dt>
                  <dd>
                    {Math.hypot(
                      selectedOpening.a[0] - selectedOpening.b[0],
                      selectedOpening.a[1] - selectedOpening.b[1],
                    ) / 32}{" "}
                    m
                  </dd>
                  <dt>Parent wall</dt>
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
                {doc?.structure && (
                  <>
                    <PropertyField label="Floor finish">
                      <input
                        key={`${selectedTile.id}:${floorStyle?.material ?? selectedTile.material}`}
                        aria-label="Floor finish"
                        disabled={blocked}
                        defaultValue={
                          floorStyle?.material ?? selectedTile.material
                        }
                        maxLength={128}
                        onBlur={(e) => {
                          if (
                            e.target.value !==
                            (floorStyle?.material ?? selectedTile.material)
                          )
                            commit((d) =>
                              setFloorStyle(d, selectedTile.id, {
                                ...d.structure?.tileStyles[selectedTile.id],
                                material: e.target.value,
                              }),
                            );
                        }}
                      />
                    </PropertyField>
                    <PropertyField label="Floor model override">
                      <select
                        aria-label="Floor model override"
                        disabled={blocked}
                        value={
                          floorStyle?.model
                            ? JSON.stringify([
                                floorStyle.model.assetId,
                                floorStyle.model.revision,
                              ])
                            : ""
                        }
                        onChange={(e) => {
                          const model = floorOptions.find(
                            (a) =>
                              JSON.stringify([a.assetId, a.revision]) ===
                              e.target.value,
                          );
                          if (e.target.value && !model) {
                            editor.setError(
                              "Choose an available pinned floor model or the generated default.",
                            );
                            return;
                          }
                          commit((d) => {
                            const { model: _old, ...style } =
                              d.structure?.tileStyles[selectedTile.id] ?? {};
                            return setFloorStyle(
                              d,
                              selectedTile.id,
                              model
                                ? {
                                    ...style,
                                    model: {
                                      assetId: model.assetId,
                                      revision: model.revision,
                                    },
                                  }
                                : style,
                            );
                          });
                        }}
                      >
                        <option value="">Generated floor model</option>
                        {floorStyle?.model &&
                          !floorOptions.some(
                            (a) =>
                              a.assetId === floorStyle.model?.assetId &&
                              a.revision === floorStyle.model.revision,
                          ) && (
                            <option
                              value={JSON.stringify([
                                floorStyle.model.assetId,
                                floorStyle.model.revision,
                              ])}
                            >
                              Saved model unavailable · retained
                            </option>
                          )}
                        {floorOptions.map((a) => (
                          <option
                            key={`${a.assetId}:${a.revision}`}
                            value={JSON.stringify([a.assetId, a.revision])}
                          >
                            {catalog?.assets.find(
                              (asset) => asset.id === a.assetId,
                            )?.label ?? a.partId}
                          </option>
                        ))}
                      </select>
                    </PropertyField>
                    <p className="layout-note">
                      Finishes and native model choices keep the floor tile
                      identity and footprint.
                    </p>
                  </>
                )}

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
          <details className="editor-disclosure">
            <summary>Design dimensions</summary>
            <EditorSection title="Dimensions">
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
                  {doc?.tiles.filter((t) => t.deckId === view.deckId).length ??
                    0}
                </dd>
                <dt>Enclosure spans</dt>
                <dd>
                  {result?.walls.filter(
                    (w) => w.deckId === view.deckId && w.source === "perimeter",
                  ).length ?? 0}
                </dd>
                <dt>Named rooms</dt>
                <dd>
                  {doc?.rooms.filter((r) => r.deckId === view.deckId).length ??
                    0}
                </dd>
              </dl>
            </EditorSection>
          </details>
          <details className="editor-disclosure">
            <summary>Deck properties</summary>
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
                    Additional decks are authored reservations. Vertical
                    traversal is not implemented.
                  </p>
                </>
              )}
            </EditorSection>
          </details>
          <details className="editor-disclosure">
            <summary>
              Validation · {errors ? `${errors} errors` : "details"}
            </summary>
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
          </details>
        </>
      )}
    </aside>
  );
}
