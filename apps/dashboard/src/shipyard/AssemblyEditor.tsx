import { HullDecalPanel } from './HullDecalPanel';
import {migrateDefaultHull} from '../../../../packages/content/src/hull-publication';
import { useEffect, useRef, useState } from "react";
import {
  Layers,
  Move,
  RotateCw,
  FlipHorizontal,
  Trash2,
  Copy,
  Undo2,
  Redo2,
  Focus,
  Download,
  MousePointer2,
  Crosshair,
} from "lucide-react";
import { Panel, ToolButton } from "@sidereal/ui";
import {
  PART_CATEGORIES,
  validateAssembly,
  placementError,
  snapPlacement,
  snapPlacementToSupport,
  type AssemblyVoxelLibrary,
  type AssemblyDocument,
  type PartCatalog,
  type PartPlacement,
  type PartCategory,
} from "../../../../packages/content/src/assembly";
import "./assembly.css";
const STORAGE = "sidereal.assembly.draft.v1";
const uuid = () =>
  crypto.randomUUID?.() ??
  `part-${Date.now()}-${Math.random().toString(16).slice(2)}`;
type History = {
  past: AssemblyDocument[];
  present: AssemblyDocument;
  future: AssemblyDocument[];
};
export default function AssemblyEditor() {
  const canvas = useRef<HTMLCanvasElement>(null),
    view = useRef<Awaited<
      ReturnType<
        (typeof import("@sidereal/render/assembly-editor"))["createAssemblyEditor"]
      >
    > | null>(null);
  const [catalog, setCatalog] = useState<PartCatalog>(),
    [history, setHistory] = useState<History>(),
    [selection, select] = useState(""),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [damage, setDamage] = useState(false),
    [recovery, setRecovery] = useState<string>();
  const [visible, setVisible] = useState<Set<PartCategory>>(
      new Set(PART_CATEGORIES.filter((c) => c !== "roof")),
    ),
    [filter, setFilter] = useState<PartCategory>("equipment");
  const voxelLibrary = useRef<AssemblyVoxelLibrary | undefined>(undefined);
  const current = useRef(history);
  current.current = history;
  const callbacks = useRef({
    move: (id: string, position: [number, number, number], copy: boolean) => {},
    damage: (id: string, cells: [number, number, number][]) => {},
  });
  const commit = (change: (doc: AssemblyDocument) => AssemblyDocument) =>
    setHistory((h) => {
      if (!h || recovery) return h;
      const proposed = change(h.present);
      const changed = proposed.parts.filter(p => p !== h.present.parts.find(old => old.id === p.id));
      const snapped = new Map(changed.map(p => [p.id, snapPlacement(p)]));
      const next = { ...proposed, parts: proposed.parts.map(p => snapped.get(p.id) ?? p) };
      if (!catalog || !voxelLibrary.current) { setError("Part occupancy is still loading."); return h; }
      try { validateAssembly(next, catalog); } catch (e) { setError(String(e)); return h; }
      for (const p of snapped.values()) {
        const previous = h.present.parts.find(old => old.id === p.id);
        if (previous && JSON.stringify({...previous, decals: undefined}) === JSON.stringify({...p, decals: undefined})) continue;
        const error = placementError(p, next, catalog, voxelLibrary.current);
        if (error) { setError(error); return h; }
      }
      setError("");
      return { past: [...h.past, h.present].slice(-40), present: next, future: [] };
    });
  const mutate = (change: Partial<PartPlacement>) =>
    commit((d) => ({
      ...d,
      parts: d.parts.map((p) => (p.id === selection ? { ...p, ...change } : p)),
    }));
  const undo = () =>
    setHistory((h) =>
      h && h.past.length
        ? {
            past: h.past.slice(0, -1),
            present: h.past.at(-1)!,
            future: [h.present, ...h.future],
          }
        : h,
    );
  const redo = () =>
    setHistory((h) =>
      h && h.future.length
        ? {
            past: [...h.past, h.present],
            present: h.future[0],
            future: h.future.slice(1),
          }
        : h,
    );
  const remove = () => {
    commit((d) => ({ ...d, parts: d.parts.filter((p) => p.id !== selection) }));
    select("");
  };
  callbacks.current.move = (id, position, copy) =>
    commit((d) => {
      const old = d.parts.find((p) => p.id === id)!;
      const moved = { ...old, id: copy ? uuid() : id, position };
      if (copy) {
        select(moved.id);
        return { ...d, parts: [...d.parts, moved] };
      }
      return { ...d, parts: d.parts.map((p) => (p.id === id ? moved : p)) };
    });
  callbacks.current.damage = (id, cells) =>
    commit((d) => ({
      ...d,
      parts: d.parts.map((p) => {
        if (p.id !== id) return p;
        const all = new Map(
          [...p.removedCells, ...cells].map((c) => [c.join(","), c]),
        );
        if (all.size > 16384) {
          setError(
            "Damage preview reached its cell budget. Undo or restore this part to continue.",
          );
          return p;
        }
        return { ...p, removedCells: [...all.values()] };
      }),
    }));
  useEffect(() => {
    let disposed = false;
    Promise.all([
      fetch("/assets/assembly/catalog.json").then((r) => r.json()),
      fetch("/assets/assembly/wayfarer.json").then((r) => r.json()),
      fetch("/assets/assembly/catalog.voxels.json").then((r) => r.json()),
      fetch("/assets/assembly/hull-manifest.json").then(r=>r.ok?r.json():null),
    ])
      .then(([catalog, source, volumes, hull]) => {
        voxelLibrary.current = volumes;
        if (disposed) return;
        setCatalog(catalog);
        let state: History = {
          past: [],
          present: validateAssembly(source, catalog),
          future: [],
        };
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(STORAGE);
          if (saved) {
            const s = JSON.parse(saved);
            if (
              !Array.isArray(s.past) ||
              !Array.isArray(s.future) ||
              s.past.length > 40 ||
              s.future.length > 40
            )
              throw new Error("Invalid history");
            state = {
              past: s.past.map((d: unknown) => validateAssembly(d, catalog)),
              present: hull?.original_default ? (hull.previous_defaults??[hull.original_default]).reduce((draft: AssemblyDocument, previous: AssemblyDocument)=>migrateDefaultHull(draft,previous,validateAssembly(source,catalog)),validateAssembly(s.present,catalog)) : validateAssembly(s.present, catalog),
              future: s.future.map((d: unknown) =>
                validateAssembly(d, catalog),
              ),
            };
          }
        } catch {
          if (saved) setRecovery(saved);
          setError(
            "The saved draft uses unavailable or invalid parts. It is preserved. Export it before starting a new draft.",
          );
        }
        setHistory(state);
      })
      .catch((e) => setError(String(e)));
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    if (!catalog || !canvas.current) return;
    let disposed = false;
    import("@sidereal/render/assembly-editor")
      .then(({ createAssemblyEditor }) =>
        createAssemblyEditor(
          canvas.current!,
          catalog,
          select,
          (...args) => callbacks.current.move(...args),
          (...args) => callbacks.current.damage(...args),
          setError,
        ),
      )
      .then((v) => {
        if (disposed) v.dispose();
        else {
          view.current = v;
          if (current.current)
            v.update(
              current.current.present,
              "",
              new Set(PART_CATEGORIES.filter((c) => c !== "roof")),
            );
          v.ready().then(() => {
            if (!disposed) setReady(true);
          });
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      disposed = true;
      view.current?.dispose();
      view.current = null;
    };
  }, [catalog]);
  useEffect(() => {
    view.current?.damageTool(damage);
  }, [damage, ready]);
  useEffect(() => {
    if (history) view.current?.update(history.present, selection, visible);
  }, [history, selection, visible, ready]);
  useEffect(() => {
    if (!history || recovery) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE, JSON.stringify(history));
      } catch {
        setError(
          "Browser storage is full. Export the draft to keep these changes.",
        );
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [history, recovery]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        )
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if ((e.ctrlKey || e.metaKey) && e.code === "KeyY") {
        e.preventDefault();
        redo();
      } else if (e.code === "Escape") {
        select("");
      } else if (selection && e.code === "Delete") {
        e.preventDefault();
        remove();
      } else if (selection && e.code === "KeyR") {
        e.preventDefault();
        const p = current.current?.present.parts.find(
          (p) => p.id === selection,
        );
        if (p) mutate({ rotation: p.rotation + Math.PI / 2 });
      } else if (selection && e.code === "KeyF") {
        e.preventDefault();
        const p = current.current?.present.parts.find(
          (p) => p.id === selection,
        );
        if (p) mutate({ flipped: !p.flipped });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selection]);
  const part = history?.present.parts.find((p) => p.id === selection),
    asset = catalog?.assets.find((a) => a.id === part?.assetId);
  const add = (assetId: string, position: [number, number, number]) => {
    const id = uuid();
    commit((d) => ({
      ...d,
      parts: [
        ...d.parts,
        snapPlacementToSupport({
          id,
          assetId,
          position,
          rotation: 0,
          flipped: false,
          removedCells: [],
        }, d, catalog!, voxelLibrary.current!),
      ],
    }));
    select(id);
    const category = catalog!.assets.find((a) => a.id === assetId)!.category;
    setVisible((v) => new Set([...v, category]));
  };
  const exportDraft = () => {
    if (!history) return;
    const u = URL.createObjectURL(
      new Blob([JSON.stringify(history.present, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = u;
    a.download = "wayfarer-assembly.json";
    a.click();
    URL.revokeObjectURL(u);
  };
  return (
    <>
      <main className="viewport assembly-editor">
        <canvas
          ref={canvas}
          tabIndex={0}
          aria-label="Modular ship draft canvas"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("sidereal/asset");
            if (catalog?.assets.some((a) => a.id === id))
              add(
                id,
                view.current?.dropPoint(e.clientX, e.clientY) ?? [0, 0, 0],
              );
          }}
        />
        <div className="assembly-title">
          <h1>Wayfarer assembly</h1>
          <span>
            Local draft · {history?.present.parts.length ?? 0} independent parts
          </span>
        </div>
        <div className="assembly-tools">
          <ToolButton
            label="Select and drag parts"
            active={!damage}
            onClick={() => setDamage(false)}
          >
            <MousePointer2 />
          </ToolButton>
          <ToolButton
            label="Voxel damage preview"
            active={damage}
            onClick={() => setDamage((v) => !v)}
          >
            <Crosshair />
          </ToolButton>
          <ToolButton
            label="Rotate selected part (R)"
            disabled={!part}
            onClick={() =>
              part && mutate({ rotation: part.rotation + Math.PI / 2 })
            }
          >
            <RotateCw />
          </ToolButton>
          <ToolButton
            label="Flip selected part (F)"
            disabled={!part}
            onClick={() => part && mutate({ flipped: !part.flipped })}
          >
            <FlipHorizontal />
          </ToolButton>
          <ToolButton
            label="Delete selected part"
            disabled={!part}
            onClick={remove}
          >
            <Trash2 />
          </ToolButton>
          <ToolButton
            label="Undo"
            disabled={!history?.past.length}
            onClick={undo}
          >
            <Undo2 />
          </ToolButton>
          <ToolButton
            label="Redo"
            disabled={!history?.future.length}
            onClick={redo}
          >
            <Redo2 />
          </ToolButton>
          <ToolButton label="Fit assembly" onClick={() => view.current?.fit()}>
            <Focus />
          </ToolButton>
        </div>
        <div
          className="assembly-palette"
          onPointerDown={(e) => {
            if (!(e.target as HTMLElement).closest(".palette-grip")) return;
            const panel = e.currentTarget,
              rect = panel.getBoundingClientRect(),
              parent = panel.parentElement!.getBoundingClientRect(),
              x = e.clientX,
              y = e.clientY;
            panel.setPointerCapture(e.pointerId);
            const move = (event: PointerEvent) => {
              panel.style.left =
                Math.max(56, rect.left - parent.left + event.clientX - x) +
                "px";
              panel.style.top =
                Math.max(65, rect.top - parent.top + event.clientY - y) + "px";
              panel.style.bottom = "auto";
            };
            const end = () => {
              panel.removeEventListener("pointermove", move);
              panel.removeEventListener("pointerup", end);
            };
            panel.addEventListener("pointermove", move);
            panel.addEventListener("pointerup", end);
          }}
        >
          <div className="palette-grip">
            <Move size={14} />
            <strong>Parts</strong>
            <span>Drag to reposition</span>
          </div>
          <select
            aria-label="Part category"
            value={filter}
            onChange={(e) => setFilter(e.target.value as PartCategory)}
          >
            {PART_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <div className="part-icon-grid">
            {catalog?.assets
              .filter((a) => a.category === filter)
              .map((a) => (
                <button
                  key={a.id}
                  title={a.label}
                  aria-label={"Add " + a.label}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData("sidereal/asset", a.id)
                  }
                  onClick={() => add(a.id, [0, 0, 0])}
                >
                  <img
                    src={a.thumbnail ?? "/assets/assembly/thumbnails/" + a.id + ".svg"}
                    alt=""
                    width={56}
                    height={56}
                    loading="lazy"
                  />
                </button>
              ))}
          </div>
        </div>
        {error && (
          <div className="assembly-error" role="alert">
            {error}
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        <div className="view-footer">
          <span>
            {ready
              ? damage
                ? "Voxel damage preview · removes actual cells"
                : "Select a part to inspect or move it"
              : "Loading modular library…"}
          </span>
          <span>MMB-drag orbit · Right-drag pan · Scroll zoom · Ctrl-drag copy</span>
        </div>
      </main>
      <aside className="inspector">
        <Panel title="Layers">
          {PART_CATEGORIES.map((category) => (
            <label className="assembly-layer" key={category}>
              <input
                type="checkbox"
                checked={visible.has(category)}
                onChange={() =>
                  setVisible((v) => {
                    const next = new Set(v);
                    next.has(category)
                      ? next.delete(category)
                      : next.add(category);
                    return next;
                  })
                }
              />
              <Layers size={14} />
              {category}
              <span>
                {history?.present.parts.filter(
                  (p) =>
                    catalog?.assets.find((a) => a.id === p.assetId)
                      ?.category === category,
                ).length ?? 0}
              </span>
            </label>
          ))}
        </Panel>
        <Panel title="Selected part">
          {part ? (
            <>
              <strong>{asset?.label}</strong>
              {asset?.visual && <small>Damage preview is unavailable for this model. Any saved damage edits are retained.</small>}
              {part.removedCells.length > 0 && (
                <button
                  className="secondary full"
                  onClick={() => mutate({ removedCells: [] })}
                >
                  Restore voxels
                </button>
              )}
              <HullDecalPanel part={part} asset={asset} disabled={!!recovery} change={decals => mutate({decals})} />
              <small className="part-id">{part.id}</small>
              <div className="part-position">
                {["East", "North", "Height"].map((axis, i) => (
                  <label key={axis}>
                    {axis}
                    <input
                      aria-label={"Part " + axis}
                      type="number"
                      step="0.03125"
                      value={part.position[i]}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        const position = [...part.position] as [
                          number,
                          number,
                          number,
                        ];
                        position[i] = n;
                        mutate({ position });
                      }}
                    />
                  </label>
                ))}
              </div>
              <button
                className="secondary full"
                onClick={() => view.current?.focus(part.id)}
              >
                <Focus size={15} /> Inspect part
              </button>
              <button
                className="secondary full"
                onClick={() =>
                  callbacks.current.move(
                    part.id,
                    [part.position[0] + 2, part.position[1], part.position[2]],
                    true,
                  )
                }
              >
                <Copy size={15} /> Duplicate
              </button>
            </>
          ) : (
            <p className="fine-print">
              Click a visible part in the canvas. Hide the roof or hull layer to
              reach objects inside.
            </p>
          )}
        </Panel>
        <Panel title="Draft">
          {recovery && (
            <>
              <button
                className="secondary full"
                onClick={() => {
                  const u = URL.createObjectURL(
                    new Blob([recovery], { type: "application/json" }),
                  );
                  const a = document.createElement("a");
                  a.href = u;
                  a.download = "preserved-assembly-history.json";
                  a.click();
                  URL.revokeObjectURL(u);
                }}
              >
                Export preserved draft
              </button>
              <button
                className="secondary full"
                onClick={() => {
                  setRecovery(undefined);
                  setError("");
                }}
              >
                Use new draft
              </button>
            </>
          )}
          <button className="secondary full" onClick={exportDraft}>
            <Download size={16} /> Export assembly
          </button>
          <a className="secondary full" href="/models">
            Model and material studies
          </a>
          <p className="fine-print">
            Parts snap to the sample grid and nearby support surfaces. Occupied
            overlaps are rejected. Draft history stays in this browser; live
            refit and functional socket validation remain separate steps.
          </p>
        </Panel>
      </aside>
    </>
  );
}
