import { useEffect, useRef, useState } from "react";
import { SquareDashed, Ship, ScanLine } from "lucide-react";
import type { useLayout } from "./useLayout";
import wayfarerTemplate from "./templates/wayfarer-r001.json";

export function NewLayoutDialog({
  editor,
  onClose,
  onResetSelection,
  inspectWayfarer,
}: {
  editor: ReturnType<typeof useLayout>;
  onClose: () => void;
  onResetSelection: () => void;
  inspectWayfarer: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("Untitled ship"),
    [kind, setKind] = useState<"ship" | "station-module">("ship");
  const [height, setHeight] = useState(3.5);
  const [sizeId, setSizeId] = useState(editor.hullCatalogue[0]?.id ?? "");
  const size = editor.hullCatalogue.find((s) => s.id === sizeId);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  const done = (success: boolean) => {
    if (success) {
      onResetSelection();
      onClose();
    }
  };
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      className="layout-dialog design-start-dialog"
      aria-label="New ship design"
    >
      <header>
        <h2>New design</h2>
        <button aria-label="Close new design" onClick={onClose}>
          ×
        </button>
      </header>
      <p>
        Your current draft stays saved. These actions create a separate design.
      </p>
      <section className="design-start-alternatives">
        <button
          className="layout-primary"
          disabled={editor.blocked}
          onClick={() => {
            if (!editor.createArmorReview()) return;
            onResetSelection();
            editor.setView((view) => ({
              ...view,
              mode: "Hull",
              projection: "3D",
              layers: {
                ...view.layers,
                floor: true,
                walls: true,
                roof: false,
                objects: true,
                exteriorHull: true,
                labels: false,
                routes: false,
                pressure: false,
              },
            }));
            onClose();
          }}
        >
          <Ship size={20} />
          <span>Open Wayfarer armor review</span>
        </button>
        <p>Editable armor blocks and fittings. Game installation is pending.</p>
      </section>
      <section className="design-start-primary">
        <h3>
          <SquareDashed size={20} /> Boundary floorplan
        </h3>
        <label>
          Design name
          <input
            aria-label="New design name"
            value={name}
            maxLength={128}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="design-start-fields">
          <label>
            Type
            <select
              aria-label="New design type"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="ship">Ship</option>
              <option value="station-module">Station module</option>
            </select>
          </label>
          <label>
            Footprint
            <select
              aria-label="New design hull size"
              value={sizeId}
              onChange={(e) => setSizeId(e.target.value)}
            >
              {editor.hullCatalogue.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.width / 32} × {s.length / 32} m
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Envelope height (m)
          <input
            aria-label="New design height"
            type="number"
            min={1.3125}
            max={256}
            step={0.03125}
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
          />
        </label>
        <button
          className="layout-primary"
          disabled={editor.blocked || !size}
          onClick={() =>
            size &&
            done(
              editor.createBlank(
                kind,
                {
                  ...size,
                  height: Math.round(height * 32),
                  origin: [-size.width / 2, -size.length / 2, 0],
                },
                name,
              ),
            )
          }
        >
          Create floorplan
        </button>
        <p>Draw floors, then select an edge to set its wall or opening.</p>
      </section>
      <details className="editor-disclosure">
        <summary>Import an existing design</summary>
        <section className="design-start-alternatives">
          <button
            disabled={editor.blocked}
            onClick={() => done(editor.createRebuiltWayfarer())}
          >
            <Ship size={20} />
            <span>Open rebuilt Wayfarer</span>
          </button>
          <button
            disabled={editor.blocked}
            onClick={() =>
              done(editor.createFloorplanFromWayfarer(wayfarerTemplate))
            }
          >
            <ScanLine size={20} />
            <span>
              Use Wayfarer footprint
              <small>
                Editable floors only. Build your own rooms and fittings.
              </small>
            </span>
          </button>
          <button disabled={editor.blocked} onClick={inspectWayfarer}>
            <Ship size={20} />
            <span>
              Inspect assembled Wayfarer
              <small>Includes the retained ship model and equipment.</small>
            </span>
          </button>
        </section>
      </details>
      {editor.error && <p role="alert">{editor.error}</p>}
      <details className="editor-disclosure">
        <summary>Open a saved local draft</summary>
        <div className="layout-saved-drafts">
          {editor.savedDrafts().map((d) => (
            <button
              key={d.key}
              onClick={() => {
                editor.openSaved(d.key);
                onResetSelection();
                onClose();
              }}
            >
              {d.name}
            </button>
          ))}
        </div>
      </details>
    </dialog>
  );
}
