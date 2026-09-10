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
        <h2>Start a ship design</h2>
        <button aria-label="Close new design" onClick={onClose}>
          ×
        </button>
      </header>
      <p>
        Your current draft stays saved. These actions create a separate design.
      </p>
      <section className="design-start-primary">
        <h3>
          <SquareDashed size={20} /> Blank floorplan
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
            Hull size
            <select
              aria-label="New design hull size"
              value={sizeId}
              onChange={(e) => setSizeId(e.target.value)}
            >
              {editor.hullCatalogue.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.width / 32} × {s.length / 32} × {s.height / 32}{" "}
                  m
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="layout-primary"
          disabled={editor.blocked || !size}
          onClick={() =>
            size &&
            done(
              editor.createBlank(
                kind,
                { ...size, origin: [-size.width / 2, -size.length / 2, 0] },
                name,
              ),
            )
          }
        >
          Create empty design
        </button>
        <p>
          No inherited tiles, walls, rooms or equipment. Draw the first floor to
          begin.
        </p>
      </section>
      <section className="design-start-alternatives">
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
