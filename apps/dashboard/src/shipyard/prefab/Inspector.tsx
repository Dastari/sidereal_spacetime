/** Right panel: properties of the selected element. */
import {
  EDGE_TYPE_IDS,
  FACE_NORMALS,
  G,
  ROOM_TYPE_IDS,
  SHAPE_TILE_IDS,
  type EdgeTypeId,
  type FaceNormal,
  type QuarterTurn,
} from "@sidereal/content/construction-grammar";
import {
  validateMount,
  type PrefabComponentCatalog,
  type PrefabIssue,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { Trash2 } from "lucide-react";
import {
  removeSelection,
  replaceTile,
  updateEdge,
  updateMount,
  updateRoom,
  updateSkylight,
  type CommandResult,
  type PrefabSelection,
} from "./commands";
import { geometriesOf } from "./derive";
import { labelFilter, NumberField, SelectField, TextField } from "./fields";
import { TilePreview } from "./ToolPanel";

type Doc = ShipPrefabDocumentV1;

interface Props {
  doc: Doc;
  catalog: PrefabComponentCatalog;
  selection: PrefabSelection | null;
  select: (s: PrefabSelection | null) => void;
  commit: (label: string, doc: Doc) => void;
  apply: (label: string, r: CommandResult) => void;
  issues: PrefabIssue[];
}

function IssuesFor({ issues }: { issues: PrefabIssue[] }) {
  if (!issues.length) return <p className="pf-ok">No issues on this element.</p>;
  return (
    <ul className="layout-validation">
      {issues.map((i, n) => (
        <li key={n} data-severity={i.severity}>
          <button tabIndex={-1}>
            <strong>{i.code.replace(/[.-]/g, " ")}</strong>
            <span>{i.message}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Inspector({ doc, catalog, selection, select, commit, apply, issues }: Props) {
  if (!selection)
    return (
      <section className="layout-section">
        <h2>Nothing selected</h2>
        <p className="layout-note">
          Use the Select tool (V) and click a volume, tile, room, edge, mount or skylight. Clicking a validation issue selects the element it refers to.
        </p>
      </section>
    );
  const remove = (
    <button
      className="pf-danger"
      onClick={() => {
        commit(`Delete ${selection.kind}`, removeSelection(doc, selection));
        select(null);
      }}
    >
      <Trash2 size={14} /> Delete <kbd>Del</kbd>
    </button>
  );
  const own = issues.filter((i) => {
    const r = i.ref;
    if (selection.kind === "tile") return r.kind === "volume" && r.id === selection.volume && r.tile === selection.index;
    return r.kind === selection.kind && "id" in r && r.id === (selection as { id: string }).id;
  });

  switch (selection.kind) {
    case "volume": {
      const v = doc.volumes.find((x) => x.id === selection.id);
      if (!v) return null;
      const g = geometriesOf(doc).find((x) => x.volume.id === v.id);
      return (
        <section className="layout-section">
          <h2>Volume {v.id}</h2>
          <dl>
            <dt>Kind</dt>
            <dd>{v.kind}</dd>
            <dt>Height class</dt>
            <dd>{G.heightClasses[v.height].label}</dd>
            <dt>Tiles</dt>
            <dd>{v.tiles.length}</dd>
            <dt>Area</dt>
            <dd>{g ? g.area.toFixed(1) : 0} m²</dd>
            <dt>Extent</dt>
            <dd>{g ? `${g.bounds[2] - g.bounds[0]} x ${g.bounds[3] - g.bounds[1]} m` : "-"}</dd>
          </dl>
          <p className="layout-note">Edit kind, height and roof options from the Volumes list in the left panel.</p>
          {remove}
          <IssuesFor issues={own} />
        </section>
      );
    }
    case "tile": {
      const t = doc.volumes.find((v) => v.id === selection.volume)?.tiles[selection.index];
      if (!t) return null;
      const set = (label: string, next: typeof t) => apply(label, replaceTile(doc, selection.volume, selection.index, next));
      return (
        <section className="layout-section">
          <h2>
            Tile {selection.index} of {selection.volume}
          </h2>
          <div className="pf-tile-inspect">
            <TilePreview shape={t.shape} rot={t.rot} reflected={t.reflected} />
          </div>
          <SelectField label="Shape" value={t.shape} options={SHAPE_TILE_IDS.map((s) => ({ value: s, label: G.shapeTiles[s].label }))} onChange={(shape) => set("Change tile shape", { ...t, shape })} />
          <SelectField
            label="Turn"
            value={String(t.rot)}
            options={["0", "1", "2", "3"].map((r) => ({ value: r, label: `${Number(r) * 90} degrees` }))}
            onChange={(r) => set("Turn tile", { ...t, rot: Number(r) as QuarterTurn })}
          />
          <SelectField label="Mirrored" value={t.reflected ? "yes" : "no"} options={["no", "yes"] as const} onChange={(v) => set("Mirror tile", { ...t, reflected: v === "yes" })} />
          <div className="pf-grid2">
            <NumberField label="X" unit="m" value={t.x} onCommit={(x) => set("Move tile", { ...t, x })} />
            <NumberField label="Y" unit="m" value={t.y} onCommit={(y) => set("Move tile", { ...t, y })} />
          </div>
          {remove}
          <IssuesFor issues={own} />
        </section>
      );
    }
    case "room": {
      const r = doc.rooms.find((x) => x.id === selection.id);
      if (!r) return null;
      const setRect = (i: number, v: number) => {
        const rect = [...r.rect] as typeof r.rect;
        rect[i] = v;
        if (rect[2] <= rect[0] || rect[3] <= rect[1]) return;
        commit("Resize room", updateRoom(doc, r.id, { rect }));
      };
      return (
        <section className="layout-section">
          <h2>Room {r.label}</h2>
          <p className="layout-id">{r.id}</p>
          <TextField label="Label" value={r.label} filter={(v) => labelFilter(v.toUpperCase())} onCommit={(label) => label && commit("Rename room", updateRoom(doc, r.id, { label }))} />
          <SelectField label="Type" value={r.type} options={ROOM_TYPE_IDS} onChange={(type) => commit("Change room type", updateRoom(doc, r.id, { type }))} />
          <div className="pf-grid2">
            <NumberField label="From X" unit="m" value={r.rect[0]} onCommit={(v) => setRect(0, v)} />
            <NumberField label="From Y" unit="m" value={r.rect[1]} onCommit={(v) => setRect(1, v)} />
            <NumberField label="To X" unit="m" value={r.rect[2]} onCommit={(v) => setRect(2, v)} />
            <NumberField label="To Y" unit="m" value={r.rect[3]} onCommit={(v) => setRect(3, v)} />
          </div>
          <p className="layout-note">
            {r.rect[2] - r.rect[0]} x {r.rect[3] - r.rect[1]} m; cells outside the deck hull are clipped. Arrow keys nudge.
          </p>
          {remove}
          <IssuesFor issues={own} />
        </section>
      );
    }
    case "edge": {
      const e = doc.edges.find((x) => x.id === selection.id);
      if (!e) return null;
      return (
        <section className="layout-section">
          <h2>Edge {e.id}</h2>
          <SelectField<EdgeTypeId>
            label="Type"
            value={e.type}
            options={EDGE_TYPE_IDS.map((t) => ({ value: t, label: G.edgeTypes[t].label }))}
            onChange={(type) => commit("Change edge type", updateEdge(doc, e.id, { type }))}
          />
          <dl>
            <dt>From</dt>
            <dd>{e.a.join(", ")}</dd>
            <dt>To</dt>
            <dd>{e.b.join(", ")}</dd>
            <dt>Seals pressure</dt>
            <dd>{G.edgeTypes[e.type].seals ? "yes" : "no"}</dd>
            <dt>Walkable</dt>
            <dd>{G.edgeTypes[e.type].walkable ? "yes" : "no"}</dd>
          </dl>
          {remove}
          <IssuesFor issues={own} />
        </section>
      );
    }
    case "mount": {
      const m = doc.mounts.find((x) => x.id === selection.id);
      if (!m) return null;
      const spec = catalog.get(m.component);
      const live = validateMount(doc, m, catalog);
      const along = m.normal === "fore" || m.normal === "aft" ? 1 : 0;
      return (
        <section className="layout-section">
          <h2>{spec?.label ?? m.component}</h2>
          <p className="layout-id">
            {m.id} · {m.component}
          </p>
          <dl>
            <dt>Hardpoint</dt>
            <dd>{m.attach === "face" && m.normal === "aft" ? "rear face" : m.attach}</dd>
            {spec && (
              <>
                <dt>Size</dt>
                <dd>{spec.sizeClass}</dd>
                <dt>Mass</dt>
                <dd>{(spec.massKg / 1000).toFixed(2)} t</dd>
                {!!spec.thrustN && (
                  <>
                    <dt>Thrust</dt>
                    <dd>{Math.round(spec.thrustN / 1000)} kN</dd>
                  </>
                )}
                <dt>Power</dt>
                <dd>
                  +{Math.round((spec.powerGenerationW ?? 0) / 1000)} / -{Math.round((spec.powerDrawW ?? 0) / 1000)} kW
                </dd>
                <dt>Heat</dt>
                <dd>
                  {Math.round((spec.heatW ?? 0) / 1000)} / rejects {Math.round((spec.heatRejectionW ?? 0) / 1000)} kW
                </dd>
              </>
            )}
          </dl>
          <div className="pf-grid2">
            <NumberField
              label="X"
              unit="m"
              step={m.attach === "edge" ? 1 : 0.5}
              value={m.at[0]}
              onCommit={(x) => commit("Move mount", updateMount(doc, m.id, { at: [x, m.at[1]] }))}
            />
            <NumberField
              label="Y"
              unit="m"
              step={m.attach === "edge" && along === 1 ? 1 : 0.5}
              value={m.at[1]}
              onCommit={(y) => commit("Move mount", updateMount(doc, m.id, { at: [m.at[0], y] }))}
            />
          </div>
          {(m.attach === "face" || m.attach === "edge" || m.attach === "interior") && (
            <SelectField<FaceNormal>
              label={m.attach === "interior" ? "Facing" : "Face normal"}
              value={m.normal ?? "fore"}
              options={FACE_NORMALS}
              onChange={(normal) => commit("Change mount normal", updateMount(doc, m.id, { normal }))}
            />
          )}
          {m.attach === "face" &&
            (m.z === undefined ? (
              <p className="layout-note">
                Centred on the face band.{" "}
                <button className="pf-link" onClick={() => commit("Set mount height", updateMount(doc, m.id, { z: 16 }))}>
                  Set a height
                </button>
              </p>
            ) : (
              <>
                <NumberField label="Bottom height" unit="texels, 1/16 m" value={m.z} min={-64} max={128} onCommit={(z) => commit("Change mount height", updateMount(doc, m.id, { z }))} />
                <button onClick={() => commit("Centre mount on face", updateMount(doc, m.id, { z: undefined }))}>Centre on face</button>
              </>
            ))}
          {remove}
          <IssuesFor issues={live} />
        </section>
      );
    }
    case "skylight": {
      const s = doc.skylights.find((x) => x.id === selection.id);
      if (!s) return null;
      return (
        <section className="layout-section">
          <h2>Skylight {s.id}</h2>
          <SelectField
            label="Size"
            value={s.size.join("x")}
            options={["2x2", "2x3", "3x2", "3x3"]}
            onChange={(v) => commit("Resize skylight", updateSkylight(doc, s.id, { size: v.split("x").map(Number) as [number, number] }))}
          />
          <div className="pf-grid2">
            <NumberField label="X" unit="m" value={s.at[0]} onCommit={(x) => commit("Move skylight", updateSkylight(doc, s.id, { at: [x, s.at[1]] }))} />
            <NumberField label="Y" unit="m" value={s.at[1]} onCommit={(y) => commit("Move skylight", updateSkylight(doc, s.id, { at: [s.at[0], y] }))} />
          </div>
          {remove}
          <IssuesFor issues={own} />
        </section>
      );
    }
  }
}
