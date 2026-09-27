import { NATIVE_FLOOR_STAMPS } from "./floor-stamps";
import { isInteriorAsset } from "@sidereal/content/layout-asset-scope";
import { PressureAreas } from "./PressureAreas";
import { RoomAssignmentPanel } from "./RoomAssignmentPanel";
import { DeviceServicesPanel } from "./DeviceServicesPanel";
import {
  SERVICE_CHANNELS,
  type ServiceChannel,
} from "@sidereal/content/ship-layout";
import { setHullEnvelope } from "@sidereal/sim/layout-structure";
import { EditorSection, PropertyField } from "@sidereal/ui/editor-controls";
import { Box, Layers, Plus, Search } from "lucide-react";
import { HullSizePanel } from "./HullSizePanel";
import type { LayoutPanelContext } from "./panel-context";
import { DOOR_WIDTHS } from "./structural-edits";
import { uuid } from "./useLayout";
export function LayoutPalette(props: LayoutPanelContext) {
  const {
    editor,
    doc,
    result,
    view,
    blocked,
    showLeft,
    select,
    updateView,
    commit,
    search,
    setSearch,
    shape,
    setShape,
    tool,
    setTool,
    channel,
    setChannel,
    reuseNodes,
    setReuseNodes,
    catalog,
    catalogError,
    asset,
    setAsset,
  } = props;
  return (
    <aside
      className="layout-left"
      aria-label="Decks and asset palette"
      hidden={!showLeft}
    >
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
                  {deck.id === doc.playableDeckId ? "Default entry" : "Deck"} ·{" "}
                  {(deck.elevation / 32).toFixed(1)} m
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
              commit((d) => {
                const structure = d.structure;
                if (structure?.schema === "sidereal.layout-structure.v2") {
                  const elevation = Math.max(
                    0,
                    ...d.decks.map(
                      (deck) =>
                        deck.elevation +
                        (structure.deckProfiles.find(
                          (p) => p.deckId === deck.id,
                        )?.pitch ?? 112),
                    ),
                  );
                  return {
                    ...d,
                    decks: [
                      ...d.decks,
                      {
                        id,
                        name: `Deck ${String.fromCharCode(65 + d.decks.length)}`,
                        order:
                          Math.max(-1, ...d.decks.map((deck) => deck.order)) +
                          1,
                        elevation,
                        ceiling: 102,
                        roof: true,
                        holes: [],
                      },
                    ],
                    structure: {
                      ...structure,
                      hull: {
                        ...structure.hull,
                        height: Math.max(
                          structure.hull.height,
                          elevation + 112 - structure.hull.origin[2],
                        ),
                      },
                      deckProfiles: [
                        ...structure.deckProfiles,
                        {
                          deckId: id,
                          floorThickness: 6,
                          clearHeight: 96,
                          roofThickness: 4,
                          serviceVoid: 6,
                          pitch: 112,
                        },
                      ],
                    },
                  };
                }
                return {
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
                };
              });
              updateView({ deckId: id });
              select([]);
            }}
          >
            <Plus size={16} /> Add deck
          </button>
        </EditorSection>
      </details>
      <EditorSection
        title={
          view.mode === "Structure"
            ? "Floor tiles"
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
              {NATIVE_FLOOR_STAMPS.filter((s) =>
                s.label.toLowerCase().includes(search.toLowerCase()),
              ).map((s) => (
                <button
                  key={s.id}
                  draggable={!blocked}
                  onDragStart={(e) =>
                    e.dataTransfer.setData(
                      "application/sidereal-layout",
                      JSON.stringify({ shape: s.id }),
                    )
                  }
                  aria-pressed={shape === s.id && tool === "stamp"}
                  onClick={() => {
                    setShape(s.id);
                    setTool("stamp");
                  }}
                  disabled={blocked}
                >
                  <svg
                    viewBox={`-8 -8 ${Math.max(...s.vertices.map((p) => p[0])) + 16} ${Math.max(...s.vertices.map((p) => p[1])) + 16}`}
                    aria-hidden="true"
                  >
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
          </>
        )}
        {view.mode === "Structure" && (
          <>
            <h3>Walls & doors</h3>
            <button
              className="layout-wide"
              disabled={blocked}
              aria-pressed={tool === "partition"}
              onClick={() => setTool("partition")}
            >
              Draw internal wall
            </button>
            <button
              className="layout-wide"
              disabled={blocked || !doc?.structure}
              aria-pressed={tool === "door"}
              onClick={() => {
                if (editor.structuralTools.doorKind === "door")
                  editor.setStructuralTools({ doorWidth: 40 });
                setTool("door");
              }}
            >
              Place door opening
            </button>
            {tool === "door" && (
              <details className="editor-disclosure" open>
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
                    {(editor.structuralTools.doorKind === "door"
                      ? [40]
                      : DOOR_WIDTHS
                    ).map((w) => (
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
                        ...(e.target.value === "door" ? { doorWidth: 40 } : {}),
                      })
                    }
                  >
                    <option value="door">Sealing door</option>
                    <option value="passage">Open passage</option>
                    <option value="airlock">Airlock opening</option>
                  </select>
                </PropertyField>
              </details>
            )}
            <h3>Rooms</h3>
            <RoomAssignmentPanel {...props} />
            {doc && result && view.layers.pressure !== false && (
              <PressureAreas doc={doc} result={result} deckId={view.deckId} />
            )}
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
                {doc?.structure?.schema === "sidereal.layout-structure.v2"
                  ? "Exterior walls occupy 250 mm inside the floor boundary. Internal walls need an explicit side. Openings require a matching native adapter."
                  : "Legacy r004 walls use a centred 125 mm envelope. Openings require a matching native adapter."}
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
            {doc && (
              <DeviceServicesPanel
                doc={doc}
                catalog={catalog}
                channel={channel}
                select={select}
                commit={commit}
                blocked={blocked}
              />
            )}

            <details className="editor-disclosure">
              <summary>Systems scope</summary>
              <p className="layout-note">
                Crossings connect only through shared endpoints. Routes record
                design intent; power and fluid simulation are not active here.
              </p>
            </details>
          </>
        )}
        {view.mode === "Hull" && (
          <>
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
            {catalogError && <p className="layout-note">{catalogError}</p>}
            <div className="layout-palette">
              {catalog?.assets
                .filter(
                  (a) =>
                    isInteriorAsset(a) &&
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
    </aside>
  );
}
