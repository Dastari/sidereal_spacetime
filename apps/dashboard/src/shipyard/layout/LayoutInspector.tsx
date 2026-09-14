import { FLOOR_FINISHES } from "@sidereal/render/floor-finishes";
import { replaceFloorShape } from "./tile-geometry-edits";
import { NATIVE_FLOOR_STAMPS, type FloorStamp } from "./floor-stamps";
import { SERVICE_CHANNELS } from "@sidereal/content/ship-layout";
import { floorModelOptions } from "@sidereal/sim/layout-native-floor";
import { setFloorStyle, setWallFace } from "@sidereal/sim/layout-structure";
import {
  EditorSection,
  ModeTabs,
  PropertyField,
  ValidationList,
} from "@sidereal/ui/editor-controls";
import type { LayoutPanelContext } from "./panel-context";
import { BoundaryTreatmentPanel } from "./BoundaryTreatmentPanel";
import { editBoundaryTreatment } from "./boundary-treatment-edits";
import { editDeckClearHeight } from "./deck-profile-edits";
import { DOOR_WIDTHS, changeStructuralOpening } from "./structural-edits";
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
    tool,
    blocked,
    showRight,
    selection,
    select,
    updateView,
    commit,
    catalog,
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
  const floorPlacement =
    view.mode === "Structure" && (tool === "stamp" || tool === "fill");
  const wallKey = props.selectedWallKey ?? selection[0];
  const wallAnchor =
    result?.walls.find((w) => w.key === wallKey)?.anchorId ?? wallKey;
  const selectedWall = result?.structure?.walls.find(
    (w) => w.id === wallKey || w.anchorId === wallAnchor,
  );
  const boundaryConfig =
    doc?.structure?.schema === "sidereal.layout-structure.v2"
      ? doc.structure
      : undefined;
  const activeProfile = boundaryConfig?.deckProfiles.find(
    (p) => p.deckId === view.deckId,
  );
  const boundarySpans =
    result?.walls.filter(
      (w) => w.key === wallKey || w.anchorId === wallAnchor,
    ) ?? [];
  const selectedBoundary =
    boundarySpans.find((w) => w.key === wallKey) ??
    (boundarySpans.length === 1 ? boundarySpans[0] : undefined);
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
        values={["Inspector", "Validation"] as const}
        value={inspector}
        onChange={setInspector}
      />
      {inspector === "Validation" ? (
        <EditorSection
          title={editor.busy || !result ? "Validating…" : `${errors} errors`}
        >
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
                ? "Opening"
                : selectedPartition
                  ? "Internal wall"
                  : selectedFitting
                    ? "Placement"
                    : selectedRoute
                      ? "Service route"
                      : selectedTile
                        ? "Floor tile"
                        : view.mode === "Hull"
                          ? "Appearance"
                          : selectedWall
                            ? boundaryConfig
                              ? selectedWall.source === "perimeter"
                                ? "Exterior boundary"
                                : "Internal boundary"
                              : selectedWall.source === "perimeter"
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
                    : `${selection.length} selected`}
                </p>
              </details>
            )}
            {selectedWall && (
              <>
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
                  <p className="layout-note">Left and right follow A → B.</p>
                </details>
              </>
            )}
            {boundaryConfig && boundarySpans.length > 1 && (
              <PropertyField label="Boundary span">
                <select
                  aria-label="Boundary span"
                  value={selectedBoundary?.key ?? ""}
                  onChange={(event) => select([event.target.value])}
                >
                  <option value="" disabled>
                    Choose an exact span
                  </option>
                  {boundarySpans.map((wall) => (
                    <option key={wall.key} value={wall.key}>
                      {wall.a.map((n) => n / 32).join(", ")} →{" "}
                      {wall.b.map((n) => n / 32).join(", ")} m
                    </option>
                  ))}
                </select>
              </PropertyField>
            )}
            {boundaryConfig && selectedBoundary && (
              <BoundaryTreatmentPanel
                wall={selectedBoundary}
                override={boundaryConfig.boundaryTreatments.find(
                  (o) => o.id === selectedBoundary.treatment?.overrideId,
                )}
                clearHeightUnits={
                  boundaryConfig.deckProfiles.find(
                    (p) => p.deckId === selectedBoundary.deckId,
                  )?.clearHeight ?? 0
                }
                disabled={blocked}
                onChange={(patch) => {
                  const newId = crypto.randomUUID();
                  commit((draft) =>
                    editBoundaryTreatment(
                      draft,
                      selectedBoundary,
                      patch,
                      newId,
                    ),
                  );
                }}
              />
            )}
            {selectedRoom && (
              <>
                <button
                  className="layout-wide"
                  onClick={() => {
                    select(
                      selectedRoom.tileIds ??
                        result?.rooms.find((r) => r.id === selectedRoom.id)
                          ?.tileIds ??
                        [],
                    );
                    props.setTool("room");
                  }}
                >
                  Select room tiles
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
                <PropertyField label="Access policy">
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
                  <dt>Area</dt>
                  <dd>
                    {result?.rooms
                      .find((r) => r.id === selectedRoom.id)
                      ?.area.toFixed(1) ?? "Unknown"}{" "}
                    m²
                  </dd>
                  <dt>Pressure / occupancy</dt>
                  <dd>Not simulated</dd>
                </dl>
              </>
            )}
            {selectedOpening && (
              <>
                {doc?.structure && (
                  <PropertyField label="Grid width" unit="m">
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
                <PropertyField label="Clearance" unit="m">
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
                <PropertyField
                  label={
                    boundaryConfig
                      ? "Design-region boundary"
                      : "Boundary intent"
                  }
                >
                  <select
                    value={selectedPartition.seal}
                    onChange={(e) =>
                      changeSelected("partitions", { seal: e.target.value })
                    }
                  >
                    <option value="design-sealed">
                      {boundaryConfig
                        ? "Separates design regions"
                        : "Sealed design"}
                    </option>
                    <option value="open-divider">Open divider</option>
                  </select>
                </PropertyField>
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
                      Empty container: {selectedFitting.container.columns} ×{" "}
                      {selectedFitting.container.rows} cells.
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
                  label="Capacity"
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
                  <dt>Connected networks</dt>
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
                      <select
                        aria-label="Floor finish"
                        disabled={blocked}
                        value={
                          floorStyle?.material ?? selectedTile.material ?? ""
                        }
                        onChange={(e) =>
                          commit((d) =>
                            setFloorStyle(d, selectedTile.id, {
                              ...d.structure?.tileStyles[selectedTile.id],
                              material: e.target.value,
                            }),
                          )
                        }
                      >
                        {!FLOOR_FINISHES.some(
                          (finish) =>
                            finish.id ===
                            (floorStyle?.material ?? selectedTile.material),
                        ) && (
                          <option
                            value={
                              floorStyle?.material ??
                              selectedTile.material ??
                              ""
                            }
                          >
                            Default panel
                          </option>
                        )}
                        {FLOOR_FINISHES.map((finish) => (
                          <option key={finish.id} value={finish.id}>
                            {finish.label}
                          </option>
                        ))}
                      </select>
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
                  </>
                )}

                <PropertyField label="Tile shape">
                  <select
                    aria-label="Tile shape"
                    value={
                      floorModelOptions(selectedTile, 0)[0]
                        ? `native:${floorModelOptions(selectedTile, 0)[0].partId}`
                        : "custom"
                    }
                    onChange={(e) =>
                      commit((d) =>
                        replaceFloorShape(
                          d,
                          selectedTile.id,
                          e.target.value as FloorStamp,
                          turns,
                        ),
                      )
                    }
                  >
                    <option value="custom" disabled>
                      Custom footprint
                    </option>
                    {NATIVE_FLOOR_STAMPS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </PropertyField>
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
              !selectedRoute &&
              !selectedTile &&
              !selectedWall &&
              !selectedBoundary &&
              view.mode !== "Hull" && (
                <>
                  {floorPlacement && (
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
                  )}
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
                  {floorPlacement && (
                    <>
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
                </>
              )}
          </EditorSection>
          {view.mode === "Hull" && doc && (
            <EditorSection title="Appearance colors">
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
                Preview colors; faction skins unavailable.
              </p>
            </EditorSection>
          )}
          <details className="editor-disclosure">
            <summary>Design dimensions</summary>
            <div className="layout-section">
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
            </div>
          </details>
          <details className="editor-disclosure">
            <summary>Deck properties</summary>
            <div className="layout-section">
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
                  <PropertyField
                    label={boundaryConfig ? "Clear height" : "Ceiling"}
                    unit="m"
                  >
                    <input
                      aria-label={
                        boundaryConfig ? "Deck clear height" : "Ceiling height"
                      }
                      type="number"
                      disabled={blocked || (!!boundaryConfig && !activeProfile)}
                      min={
                        activeProfile
                          ? Math.max(1, 32 - activeProfile.floorThickness) / 32
                          : 1
                      }
                      max={
                        activeProfile
                          ? (512 - activeProfile.floorThickness) / 32
                          : 16
                      }
                      step={boundaryConfig ? 1 / 32 : 0.5}
                      value={
                        (activeProfile?.clearHeight ??
                          doc.decks.find((d) => d.id === view.deckId)
                            ?.ceiling ??
                          96) / 32
                      }
                      onChange={(e) => {
                        if (!e.target.validity.valid || e.target.value === "")
                          return;
                        const units = Number(e.target.value) * 32;
                        if (boundaryConfig) {
                          commit((d) =>
                            editDeckClearHeight(d, view.deckId, units),
                          );
                          return;
                        }
                        commit((d) => ({
                          ...d,
                          decks: d.decks.map((deck) =>
                            deck.id === view.deckId
                              ? {
                                  ...deck,
                                  ceiling: Math.round(units),
                                }
                              : deck,
                          ),
                        }));
                      }}
                    />
                  </PropertyField>
                  {activeProfile && (
                    <p className="layout-note">
                      Floor {(activeProfile.floorThickness / 32).toFixed(4)} m ·
                      roof {(activeProfile.roofThickness / 32).toFixed(4)} m ·
                      service void {(activeProfile.serviceVoid / 32).toFixed(4)}{" "}
                      m. Pitch {(activeProfile.pitch / 32).toFixed(4)} m.
                    </p>
                  )}
                  <label className="layout-check">
                    <input
                      type="checkbox"
                      disabled={blocked}
                      checked={
                        doc.decks.find((d) => d.id === view.deckId)?.roof ??
                        false
                      }
                      onChange={(e) => {
                        const roof = e.target.checked;
                        commit((d) => ({
                          ...d,
                          decks: d.decks.map((deck) =>
                            deck.id === view.deckId ? { ...deck, roof } : deck,
                          ),
                        }));
                      }}
                    />
                    Include roof
                  </label>
                  <button
                    className="layout-wide"
                    disabled={blocked || doc.playableDeckId === view.deckId}
                    onClick={() =>
                      commit((d) => ({ ...d, playableDeckId: view.deckId }))
                    }
                  >
                    Set playable deck
                  </button>
                  <p className="layout-note">
                    Vertical traversal is not yet supported.
                  </p>
                </>
              )}
            </div>
          </details>
        </>
      )}
    </aside>
  );
}
