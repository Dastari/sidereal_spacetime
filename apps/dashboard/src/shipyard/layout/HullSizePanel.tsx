import { useEffect, useState } from "react";
import type { LayoutDocument } from "@sidereal/content/ship-layout";
import type { HullEnvelope } from "@sidereal/content/layout-structure";
import { EditorSection, PropertyField } from "@sidereal/ui/editor-controls";
import { fittedHullEnvelope, type HullSizeDefinition } from "./hull-catalogue";
import { uuid, type useLayout } from "./useLayout";

export function HullSizePanel({
  editor,
  doc,
  blocked,
  apply,
}: {
  editor: ReturnType<typeof useLayout>;
  doc: LayoutDocument;
  blocked: boolean;
  apply: (hull: HullEnvelope) => void;
}) {
  const fresh = () => {
    const fit = fittedHullEnvelope(doc);
    return {
      id: "",
      revision: "",
      name: "Custom hull",
      width: fit.width,
      length: fit.length,
      height: fit.height,
    };
  };
  const initial = () =>
    editor.hullCatalogue.find((h) => h.id === doc.structure?.hull.id) ??
    editor.hullCatalogue[0] ??
    fresh();
  const [draft, setDraft] = useState<HullSizeDefinition>(initial),
    [origin, setOrigin] = useState<[number, number, number]>(
      doc.structure?.hull.origin ?? fittedHullEnvelope(doc).origin,
    ),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    setDraft(initial());
    setOrigin(doc.structure?.hull.origin ?? fittedHullEnvelope(doc).origin);
    setDirty(false);
  }, [doc.id]);
  useEffect(() => {
    if (!dirty) {
      const next =
        editor.hullCatalogue.find((h) => h.id === draft.id) ??
        editor.hullCatalogue[0];
      if (next) setDraft(next);
    }
  }, [editor.hullCatalogue]);
  const edit = (patch: Partial<HullSizeDefinition>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  return (
    <EditorSection title="Hull size">
      <PropertyField label="Size catalogue">
        <select
          aria-label="Hull size catalogue"
          value={draft.id}
          disabled={blocked}
          onChange={(e) => {
            const next = editor.hullCatalogue.find(
              (h) => h.id === e.target.value,
            );
            if (next) {
              setDraft(next);
              setDirty(false);
            }
          }}
        >
          {!editor.hullCatalogue.some((h) => h.id === draft.id) && (
            <option value={draft.id}>
              {draft.id ? "Unsaved size" : "New size"}
            </option>
          )}
          {editor.hullCatalogue.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </PropertyField>
      <PropertyField label="Size name">
        <input
          aria-label="Hull size name"
          disabled={blocked}
          maxLength={128}
          value={draft.name}
          onChange={(e) => edit({ name: e.target.value })}
        />
      </PropertyField>
      {(
        [
          ["width", "Width"],
          ["length", "Length"],
          ["height", "Total height"],
        ] as const
      ).map(([key, label]) => (
        <PropertyField key={key} label={label} unit="m">
          <input
            aria-label={`Hull ${key}`}
            disabled={blocked}
            type="number"
            min=".5"
            max="256"
            step=".5"
            value={draft[key] / 32}
            onChange={(e) => edit({ [key]: Number(e.target.value) * 32 })}
          />
        </PropertyField>
      ))}
      <div className="layout-structural-actions">
        <button
          className="layout-wide"
          disabled={blocked || editor.hullCatalogue.length >= 64}
          onClick={() => {
            setDraft(fresh());
            setDirty(true);
          }}
        >
          New size from layout
        </button>
        <button
          className="layout-wide"
          disabled={blocked}
          onClick={() => {
            const entry = {
              ...draft,
              id: draft.id || uuid(),
              revision: uuid(),
            };
            if (editor.saveHullSize(entry)) {
              setDraft(entry);
              setDirty(false);
            }
          }}
        >
          Save catalogue size
        </button>
      </div>
      <details>
        <summary>Hull origin</summary>
        {(["X", "Y", "Z"] as const).map((axis, i) => (
          <PropertyField key={axis} label={`Minimum ${axis}`} unit="m">
            <input
              aria-label={`Hull origin ${axis}`}
              disabled={blocked}
              type="number"
              step=".5"
              value={origin[i] / 32}
              onChange={(e) =>
                setOrigin(
                  (previous) =>
                    previous.map((n, j) =>
                      i === j ? Number(e.target.value) * 32 : n,
                    ) as [number, number, number],
                )
              }
            />
          </PropertyField>
        ))}
        <button
          className="layout-wide"
          disabled={blocked}
          onClick={() => setOrigin(fittedHullEnvelope(doc).origin)}
        >
          Align with layout minimum
        </button>
      </details>
      <button
        className="layout-wide"
        disabled={blocked || dirty || !draft.id || !draft.revision}
        onClick={() => apply({ ...draft, origin })}
      >
        Apply hull size to draft
      </button>
      <p className="layout-note">
        {dirty
          ? "Save this size before applying its limits."
          : doc.structure
            ? `Current limits: ${doc.structure.hull.name}.`
            : "Choose and apply usable width, length and total deck height."}{" "}
        Applying limits keeps every floor and object in place.
      </p>
      {editor.hullCatalogueError && (
        <p role="alert" className="layout-note">
          {editor.hullCatalogueError}
        </p>
      )}
      <details>
        <summary>Import / export sizes</summary>
        <button className="layout-wide" onClick={editor.exportHullCatalogue}>
          Export size catalogue
        </button>
        <label className="layout-wide">
          Import size catalogue
          <input
            type="file"
            aria-label="Import hull size catalogue"
            accept="application/json,.json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void editor.importHullCatalogue(f);
              e.target.value = "";
            }}
          />
        </label>
      </details>
    </EditorSection>
  );
}
