/** Left panel: options for the active tool (volumes and tiles, rooms, edges, mounts, skylights). */
import {
  BLUEPRINT_SIZE_CLASS_IDS,
  EDGE_TYPE_IDS,
  G,
  HEIGHT_CLASS_IDS,
  MOUNT_SIZE_IDS,
  ROOM_TYPE_IDS,
  SHAPE_TILE_IDS,
  mountSizeRank,
  placedTilePolygon,
  placedTileSize,
  type FaceNormal,
  type QuarterTurn,
  type ShapeTileId,
} from "@sidereal/content/construction-grammar";
import type { PrefabComponentCatalog, PrefabComponentSpec, ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";
import { FlipHorizontal2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { addVolume, removeVolume, updateVolume } from "./commands";
import { CheckField, SelectField } from "./fields";
import { SKYLIGHT_SIZES, TOOLS, type ToolState } from "./keymap";
import { CATEGORY_LABELS, mountColour, ROOM_COLOURS } from "./palette";
import { mountModes, type MountMode } from "./snapping";

type Doc = ShipPrefabDocumentV1;

interface Props {
  doc: Doc;
  catalog: PrefabComponentCatalog;
  tools: ToolState;
  setTools: (patch: Partial<ToolState>) => void;
  commit: (label: string, doc: Doc) => void;
}

export function TilePreview({ shape, rot, reflected }: { shape: ShapeTileId; rot: QuarterTurn; reflected: boolean }) {
  const [w, h] = placedTileSize({ shape, rot });
  const poly = placedTilePolygon({ x: 0, y: 0, shape, rot, reflected });
  const m = Math.max(w, h);
  return (
    <svg viewBox={`-0.15 -0.15 ${m + 0.3} ${m + 0.3}`} aria-hidden="true">
      <rect x={0} y={0} width={m} height={m} className="pf-tile-cell" />
      <polygon points={poly.map(([x, y]) => `${x},${m - y}`).join(" ")} className="pf-tile-shape" />
    </svg>
  );
}

function VolumePanel({ doc, tools, setTools, commit }: Props) {
  const active = doc.volumes.find((v) => v.id === tools.volume);
  return (
    <section className="layout-section">
      <h2>Volumes</h2>
      <div className="pf-volume-list" role="listbox" aria-label="Volumes">
        {doc.volumes.map((v) => (
          <button
            key={v.id}
            role="option"
            aria-selected={v.id === tools.volume}
            onClick={() => setTools({ volume: v.id })}
            className="pf-volume-row"
          >
            <i className={`pf-kind ${v.kind}`} />
            <span>{v.id}</span>
            <small>
              {G.heightClasses[v.height].label.split(" ")[0]} {v.height} · {v.tiles.length}
            </small>
          </button>
        ))}
      </div>
      <div className="pf-row">
        <button
          onClick={() => {
            const r = addVolume(doc, { kind: "hull", height: "pod" });
            commit("Add hull volume", r.doc);
            if (r.select?.kind === "volume") setTools({ volume: r.select.id });
          }}
        >
          <Plus size={14} /> Hull
        </button>
        <button
          onClick={() => {
            const r = addVolume(doc, { kind: "plate", height: "wing" });
            commit("Add plate volume", r.doc);
            if (r.select?.kind === "volume") setTools({ volume: r.select.id });
          }}
        >
          <Plus size={14} /> Plate
        </button>
        <button
          disabled={!active}
          aria-label="Remove active volume"
          title="Remove active volume"
          onClick={() => {
            if (!active) return;
            commit(`Remove volume ${active.id}`, removeVolume(doc, active.id));
            setTools({ volume: doc.volumes.find((v) => v.id !== active.id)?.id ?? "" });
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {active && (
        <div className="pf-fields">
          <SelectField
            label="Kind"
            value={active.kind}
            options={["hull", "plate"] as const}
            onChange={(kind) => {
              const height = G.heightClasses[active.height].kinds.includes(kind) ? active.height : kind === "plate" ? "wing" : "pod";
              commit("Change volume kind", updateVolume(doc, active.id, { kind, height, ...(kind === "plate" ? { spine: undefined, logo: undefined } : {}) }));
            }}
          />
          <SelectField
            label="Height class"
            value={active.height}
            options={HEIGHT_CLASS_IDS.filter((h) => G.heightClasses[h].kinds.includes(active.kind)).map((h) => ({ value: h, label: G.heightClasses[h].label }))}
            onChange={(height) => commit("Change height class", updateVolume(doc, active.id, { height }))}
          />
          {active.kind === "hull" && (
            <>
              <CheckField label="Roof spine" checked={!!active.spine} onChange={(spine) => commit("Toggle spine", updateVolume(doc, active.id, { spine }))} />
              <CheckField
                label="Logo cassettes"
                checked={active.logo ?? active.height === "deck"}
                onChange={(logo) => commit("Toggle logo", updateVolume(doc, active.id, { logo }))}
              />
              <SelectField
                label="Face style"
                value={active.faceStyle ?? "default"}
                options={[
                  { value: "default", label: "Cassettes" },
                  { value: "windows", label: "Viewport glazing" },
                ]}
                onChange={(faceStyle) => commit("Change face style", updateVolume(doc, active.id, { faceStyle: faceStyle === "default" ? undefined : faceStyle }))}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function TilePicker({ tools, setTools }: Pick<Props, "tools" | "setTools">) {
  return (
    <section className="layout-section">
      <h2>Shape tile</h2>
      <div className="pf-tile-grid" role="radiogroup" aria-label="Shape tile">
        {SHAPE_TILE_IDS.map((shape) => (
          <button
            key={shape}
            role="radio"
            aria-checked={tools.shape === shape}
            aria-pressed={tools.shape === shape}
            title={G.shapeTiles[shape].label}
            onClick={() => setTools({ shape, tool: tools.tool === "erase" ? "hull" : tools.tool })}
          >
            <TilePreview shape={shape} rot={tools.rot} reflected={tools.reflected} />
            <span>{G.shapeTiles[shape].label}</span>
          </button>
        ))}
      </div>
      <div className="pf-row">
        <button title="Rotate (R)" onClick={() => setTools({ rot: ((tools.rot + 1) % 4) as QuarterTurn })}>
          <RotateCcw size={14} /> Rotate <kbd>R</kbd>
        </button>
        <button title="Mirror (F)" aria-pressed={tools.reflected} onClick={() => setTools({ reflected: !tools.reflected })}>
          <FlipHorizontal2 size={14} /> Mirror <kbd>F</kbd>
        </button>
      </div>
      <p className="layout-note">
        Turn {tools.rot * 90} degrees{tools.reflected ? ", mirrored" : ""}. Overlapping tiles are refused and shown in red.
      </p>
    </section>
  );
}

function RoomPanel({ tools, setTools }: Pick<Props, "tools" | "setTools">) {
  return (
    <section className="layout-section">
      <h2>Room type</h2>
      <div className="pf-room-types" role="radiogroup" aria-label="Room type">
        {ROOM_TYPE_IDS.map((t) => (
          <button key={t} role="radio" aria-checked={tools.roomType === t} aria-pressed={tools.roomType === t} onClick={() => setTools({ roomType: t, roomLabel: "" })}>
            <i style={{ background: ROOM_COLOURS[t] }} />
            {t}
            {G.roomTypes[t].control && <small>pilot</small>}
          </button>
        ))}
      </div>
      <label className="pf-field">
        <span>Label</span>
        <input
          value={tools.roomLabel}
          placeholder={tools.roomType.toUpperCase()}
          maxLength={32}
          onChange={(e) => setTools({ roomLabel: e.target.value.toUpperCase().replace(/[^A-Z0-9 ._/'&-]/g, "") })}
        />
      </label>
      <p className="layout-note">
        Floor {G.roomTypes[tools.roomType].floor}, walls {G.roomTypes[tools.roomType].walls.join(" and ")}.
        {G.roomTypes[tools.roomType].sockets.length ? ` Furnished with ${G.roomTypes[tools.roomType].sockets.length} derived object sockets.` : ""}{" "}
        Walls, doors between rooms need the Edge tool.
      </p>
    </section>
  );
}

function EdgePanel({ tools, setTools }: Pick<Props, "tools" | "setTools">) {
  return (
    <section className="layout-section">
      <h2>Edge type</h2>
      <div className="pf-edge-types" role="radiogroup" aria-label="Edge type">
        {EDGE_TYPE_IDS.map((t) => {
          const e = G.edgeTypes[t];
          return (
            <button key={t} role="radio" aria-checked={tools.edgeType === t} aria-pressed={tools.edgeType === t} onClick={() => setTools({ edgeType: t })}>
              <i className={`pf-edge-swatch t-${t.replace(/\./g, "-")}`} />
              <span>{e.label}</span>
              <small>
                {e.door ? "2 m door" : "1 m"} · {e.seals ? "seals" : "open air"}
              </small>
            </button>
          );
        })}
      </div>
      <p className="layout-note">
        Edges sit on room boundaries inside the hull. Exterior openings are edge mounts (airlocks, cargo doors) from the Mount tool.
      </p>
    </section>
  );
}

const formatKw = (w?: number) => (w ? `${Math.round(w / 1000)} kW` : "");

function specSummary(s: PrefabComponentSpec) {
  const parts = [`${s.cells[0]}x${s.cells[1]} m`, `${(s.massKg / 1000).toFixed(1)} t`];
  if (s.thrustN) parts.push(`${Math.round(s.thrustN / 1000)} kN`);
  if (s.powerGenerationW) parts.push(`+${formatKw(s.powerGenerationW)}`);
  if (s.powerDrawW) parts.push(`-${formatKw(s.powerDrawW)}`);
  if (s.heatW) parts.push(`heat ${formatKw(s.heatW)}`);
  if (s.heatRejectionW) parts.push(`rejects ${formatKw(s.heatRejectionW)}`);
  return parts.join(" · ");
}

const ATTACH_FILTERS = ["all", "top", "face", "rear", "edge", "interior"] as const;

function MountPanel({ doc, catalog, tools, setTools }: Props) {
  const [search, setSearch] = useState("");
  const [attach, setAttach] = useState<(typeof ATTACH_FILTERS)[number]>("all");
  const [fits, setFits] = useState(true);
  const maxMount = G.blueprintSizeClasses[doc.sizeClass].maxMount;
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = catalog.list().filter(
      (s) =>
        (!q || s.label.toLowerCase().includes(q) || s.id.includes(q) || s.category.includes(q)) &&
        (attach === "all" || s.attach.includes(attach)) &&
        (!fits || mountSizeRank(s.sizeClass) <= mountSizeRank(maxMount)),
    );
    const out = new Map<string, PrefabComponentSpec[]>();
    for (const s of list) {
      const k = s.category.split(".")[0];
      if (!out.has(k)) out.set(k, []);
      out.get(k)!.push(s);
    }
    return [...out.entries()];
  }, [catalog, search, attach, fits, maxMount]);
  const spec = tools.component ? catalog.get(tools.component) : undefined;
  const modes = spec ? mountModes(spec) : [];
  return (
    <>
      {spec && (
        <section className="layout-section pf-mount-current">
          <h2>{spec.label}</h2>
          <p className="pf-spec-line">
            <b className={`pf-size s-${spec.sizeClass}`}>{spec.sizeClass}</b> {specSummary(spec)}
          </p>
          {modes.length > 1 && (
            <div className="pf-segmented" role="radiogroup" aria-label="Hardpoint">
              {modes.map((m) => (
                <button key={m} role="radio" aria-checked={tools.mountMode === m} aria-pressed={tools.mountMode === m} onClick={() => setTools({ mountMode: m })}>
                  {m === "face" && !spec.attach.includes("face") ? "rear" : m}
                </button>
              ))}
            </div>
          )}
          {tools.mountMode === "interior" && (
            <div className="pf-segmented" role="radiogroup" aria-label="Facing">
              {(["fore", "port", "aft", "starboard"] as FaceNormal[]).map((f) => (
                <button key={f} role="radio" aria-checked={tools.facing === f} aria-pressed={tools.facing === f} onClick={() => setTools({ facing: f })}>
                  {f}
                </button>
              ))}
            </div>
          )}
          <p className="layout-note">
            {tools.mountMode === "top" && "Top hardpoints snap to the 0.5 m roof grid; the footprint must sit on one roof height."}
            {tools.mountMode === "face" && "Face mounts snap to the nearest straight hull face and take its outward normal. Rear-facing engines push the ship fore."}
            {tools.mountMode === "edge" && "Openings sit on a straight face of the walkable deck and open into a room."}
            {tools.mountMode === "interior" && "Interior modules sit on whole floor cells inside one room. R turns them."}
          </p>
        </section>
      )}
      <section className="layout-section">
        <h2>Components</h2>
        <input className="pf-search" type="search" placeholder="Search components" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search components" />
        <div className="pf-chips" role="radiogroup" aria-label="Hardpoint filter">
          {ATTACH_FILTERS.map((a) => (
            <button key={a} role="radio" aria-checked={attach === a} aria-pressed={attach === a} onClick={() => setAttach(a)}>
              {a}
            </button>
          ))}
        </div>
        <CheckField label={`Fits size ${doc.sizeClass} (up to ${maxMount})`} checked={fits} onChange={setFits} />
        <div className="pf-palette">
          {groups.map(([cat, specs]) => (
            <div key={cat} className="pf-palette-group">
              <h3>{CATEGORY_LABELS[cat] ?? cat}</h3>
              {specs.map((s) => {
                const tooBig = mountSizeRank(s.sizeClass) > mountSizeRank(maxMount);
                return (
                  <button
                    key={s.id}
                    className="pf-component"
                    aria-pressed={tools.component === s.id}
                    data-component={s.id}
                    title={`${s.id}\n${s.attach.join(", ")} hardpoint`}
                    onClick={() => {
                      const m = mountModes(s);
                      setTools({ component: s.id, mountMode: m.includes(tools.mountMode) ? tools.mountMode : m[0], tool: "mount" });
                    }}
                  >
                    <i style={{ background: mountColour(s.category) }} />
                    <span>
                      {s.label}
                      <small>{specSummary(s)}</small>
                    </span>
                    <b className={`pf-size s-${s.sizeClass}${tooBig ? " over" : ""}`}>{s.sizeClass}</b>
                  </button>
                );
              })}
            </div>
          ))}
          {!groups.length && <p className="layout-note">No component matches. Clear the search or the filters.</p>}
        </div>
        <p className="layout-note">
          Catalog {catalog.revision}. Size classes {MOUNT_SIZE_IDS.join(", ")}; blueprints {BLUEPRINT_SIZE_CLASS_IDS.map((b) => `${b} up to ${G.blueprintSizeClasses[b].maxMount}`).join(", ")}.
        </p>
      </section>
    </>
  );
}

function SkylightPanel({ tools, setTools }: Pick<Props, "tools" | "setTools">) {
  return (
    <section className="layout-section">
      <h2>Skylight</h2>
      <div className="pf-segmented" role="radiogroup" aria-label="Skylight size">
        {SKYLIGHT_SIZES.map((s) => (
          <button key={s.join("x")} role="radio" aria-checked={tools.skylight.join() === s.join()} aria-pressed={tools.skylight.join() === s.join()} onClick={() => setTools({ skylight: s })}>
            {s[0]} x {s[1]}
          </button>
        ))}
      </div>
      <p className="layout-note">Skylights sit fully on a hull roof and may not overlap top mounts.</p>
    </section>
  );
}

export function ToolPanel(props: Props) {
  const { tools } = props;
  const info = TOOLS.find((t) => t.id === tools.tool)!;
  return (
    <aside className="layout-left pf-left" aria-label={`${info.label} options`}>
      <section className="layout-section pf-tool-heading">
        <h2>
          {info.label} <kbd>{info.key}</kbd>
        </h2>
        <p className="layout-note">{info.hint}</p>
      </section>
      {(tools.tool === "hull" || tools.tool === "erase") && (
        <>
          <VolumePanel {...props} />
          {tools.tool === "hull" && <TilePicker {...props} />}
        </>
      )}
      {tools.tool === "select" && <VolumePanel {...props} />}
      {tools.tool === "room" && <RoomPanel {...props} />}
      {tools.tool === "edge" && <EdgePanel {...props} />}
      {tools.tool === "mount" && <MountPanel {...props} />}
      {tools.tool === "skylight" && <SkylightPanel {...props} />}
    </aside>
  );
}

export type { MountMode };
