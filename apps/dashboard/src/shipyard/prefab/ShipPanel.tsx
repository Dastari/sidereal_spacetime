/** Document header: identity, size class limits, theme and hull markings. */
import { BLUEPRINT_SIZE_CLASS_IDS, G } from "@sidereal/content/construction-grammar";
import { EMBLEM_IDS, SHIP_THEME_IDS, type ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";
import { SHIP_THEMES } from "@sidereal/content/ship-themes";
import { useEffect, useState } from "react";
import { updateMarkings, updateMeta } from "./commands";
import { labelFilter, markingFilter, SelectField, TextField } from "./fields";
import { linearToHex } from "./palette";

type Doc = ShipPrefabDocumentV1;

const SLOT_ORDER = ["primary", "secondary", "accent", "trim", "metal", "dark", "emit_a", "emit_b", "glass"] as const;

export function ThemeSwatches({ theme }: { theme: Doc["theme"] }) {
  const t = SHIP_THEMES[theme];
  return (
    <span className="pf-swatches" aria-label={`${t.label} material slots`}>
      {SLOT_ORDER.map((slot) => (
        <i key={slot} title={slot.replace("_", " ")} style={{ background: linearToHex(t.slots[slot].colour) }} />
      ))}
    </span>
  );
}

export function ShipPanel({
  doc,
  commit,
  changeId,
}: {
  doc: Doc;
  commit: (label: string, doc: Doc) => void;
  changeId: (id: string) => string | null;
}) {
  const [id, setId] = useState(doc.id);
  const [idError, setIdError] = useState("");
  useEffect(() => {
    setId(doc.id);
    setIdError("");
  }, [doc.id]);
  const size = G.blueprintSizeClasses[doc.sizeClass];
  return (
    <>
      <section className="layout-section">
        <h2>Ship</h2>
        <TextField label="Name" value={doc.name} filter={labelFilter} onCommit={(name) => name && commit("Rename ship", updateMeta(doc, { name }))} />
        <label className="pf-field">
          <span>Blueprint id</span>
          <span className="pf-inline">
            <input
              value={id}
              onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 80))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && id !== doc.id) setIdError(changeId(id) ?? "");
              }}
            />
            <button disabled={id === doc.id || !id} onClick={() => setIdError(changeId(id) ?? "")}>
              Change
            </button>
          </span>
          {idError && <small className="pf-error">{idError}</small>}
        </label>
        <div className="pf-grid2">
          <TextField label="Role" value={doc.role} maxLength={40} onCommit={(role) => commit("Change role", updateMeta(doc, { role }))} />
          <TextField label="Faction" value={doc.faction} maxLength={40} onCommit={(faction) => commit("Change faction", updateMeta(doc, { faction }))} />
        </div>
        <TextField
          label="Description"
          multiline
          maxLength={400}
          value={doc.description}
          filter={(v) => v.replace(/[\u0000-\u001f]/g, " ")}
          onCommit={(description) => commit("Change description", updateMeta(doc, { description }))}
        />
        <p className="layout-note">Revision {doc.revision}. Publishing bumps it.</p>
      </section>
      <section className="layout-section">
        <h2>Size class</h2>
        <div className="pf-segmented" role="radiogroup" aria-label="Blueprint size class">
          {BLUEPRINT_SIZE_CLASS_IDS.map((s) => (
            <button key={s} role="radio" aria-checked={doc.sizeClass === s} onClick={() => commit("Change size class", updateMeta(doc, { sizeClass: s }))}>
              {s}
            </button>
          ))}
        </div>
        <dl>
          <dt>Class</dt>
          <dd>{size.label}</dd>
          <dt>Largest extent</dt>
          <dd>
            {size.maxCells[0]} x {size.maxCells[1]} m
          </dd>
          <dt>Largest mount</dt>
          <dd>{size.maxMount}</dd>
          <dt>Hardpoint mounts</dt>
          <dd>{size.maxMounts}</dd>
          <dt>Decks</dt>
          <dd>{size.maxDecks}</dd>
        </dl>
      </section>
      <section className="layout-section">
        <h2>Theme</h2>
        <div className="pf-themes" role="radiogroup" aria-label="Theme">
          {SHIP_THEME_IDS.map((t) => (
            <button key={t} role="radio" aria-checked={doc.theme === t} onClick={() => commit("Change theme", updateMeta(doc, { theme: t }))}>
              <span>{SHIP_THEMES[t].label}</span>
              <ThemeSwatches theme={t} />
            </button>
          ))}
        </div>
        <p className="layout-note">A theme only swaps the nine kit material slots; geometry never changes. Proposed palettes, not approved art.</p>
      </section>
      <section className="layout-section">
        <h2>Markings</h2>
        <div className="pf-grid2">
          <TextField label="Hull name" value={doc.markings.name} filter={markingFilter(16)} onCommit={(name) => commit("Change marking name", updateMarkings(doc, { name }))} />
          <TextField label="Number" value={doc.markings.number} filter={markingFilter(10)} onCommit={(number) => commit("Change hull number", updateMarkings(doc, { number }))} />
        </div>
        <SelectField label="Emblem" value={doc.markings.emblem} options={EMBLEM_IDS} onChange={(emblem) => commit("Change emblem", updateMarkings(doc, { emblem }))} />
      </section>
    </>
  );
}
