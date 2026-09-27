import { useState } from "react";
import {
  ChevronRight,
  Orbit,
  Circle,
  Diamond,
  Rocket,
  Globe2,
} from "lucide-react";
import {
  mapBodyRole,
  type SystemMapDocument,
} from "@sidereal/content/system-map";
import { readSystemMap } from "@sidereal/sim/system-map";
import { mapZones, reparentMapObject } from "./map-commands";
import type { MapShip } from "./MapCanvas";

type Node = {
  systemId: string;
  id: string;
  name: string;
  kind: string;
  parent?: string | null;
  color?: string;
  children: Node[];
};
export default function UniverseTree({
  doc,
  maps,
  ships,
  search,
  selection,
  onSelect,
  onFrame,
  onLoad,
  busy,
  writable,
  onReparent,
  onContextMenu,
  onDropError,
}: {
  doc: SystemMapDocument;
  maps: { id: string; documentJson: string }[];
  ships: MapShip[];
  search: string;
  selection: string[];
  onSelect: (id: string, additive?: boolean) => void;
  onFrame: (id: string) => void;
  onLoad: (id: string, selectedId?: string) => void;
  busy: boolean;
  writable: boolean;
  onReparent: (id: string, parentId: string) => void;
  onContextMenu: (x: number, y: number, id: string) => void;
  onDropError: (message: string) => void;
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [dragged, setDragged] = useState<string | null>(null),
    [over, setOver] = useState<string | null>(null);
  const query = search.trim().toLowerCase();
  const toggle = (id: string, collapse: boolean) =>
    setClosed((old) => {
      const next = new Set(old);
      collapse ? next.add(id) : next.delete(id);
      return next;
    });
  function systemNode(system: SystemMapDocument): Node {
    const nodes: Node[] = [
      ...system.bodies.map((b) => ({
        ...b,
        systemId: system.id,
        kind: mapBodyRole(b, system.bodies),
        parent: b.parentId,
        children: [],
      })),
      ...mapZones(system).map((z) => ({
        ...z,
        systemId: system.id,
        kind: system.fields.some((f) => f.id === z.id)
          ? "Asteroid field"
          : "Zone",
        parent: z.parentId,
        children: [],
      })),
      ...ships
        .filter((s) => s.systemId === system.id)
        .map((s) => ({
          id: s.shipId,
          systemId: system.id,
          name: s.name,
          kind: "Live ship",
          children: [],
        })),
    ];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const roots: Node[] = [];
    for (const n of nodes) {
      let p = n.parent ? byId.get(n.parent) : undefined;
      const visited = new Set([n.id]);
      let current = p;
      while (current) {
        if (visited.has(current.id)) {
          p = undefined;
          break;
        }
        visited.add(current.id);
        current = current.parent ? byId.get(current.parent) : undefined;
      }
      if (p) p.children.push(n);
      else roots.push(n);
    }
    return {
      systemId: system.id,
      id: system.id,
      name: system.name,
      kind: "System",
      color: system.color,
      children: roots,
    };
  }
  const root = systemNode(doc);
  const others: Node[] = maps
    .filter((m) => m.id !== doc.id)
    .map((m) => {
      try {
        return systemNode(readSystemMap(m.documentJson));
      } catch {
        return {
          systemId: m.id,
          id: m.id,
          name: m.id,
          kind: "Unavailable system",
          children: [],
        };
      }
    });
  const matches = (n: Node): boolean =>
    !query ||
    `${n.name} ${n.id} ${n.kind}`.toLowerCase().includes(query) ||
    n.children.some(matches);
  const render = (n: Node, depth: number, inheritedMatch = false) => {
    if (!inheritedMatch && !matches(n)) return null;
    const selfMatch =
      inheritedMatch ||
      (!!query && `${n.name} ${n.id} ${n.kind}`.toLowerCase().includes(query));
    const expanded = !!query || !closed.has(n.id);
    const Icon =
      n.kind === "System"
        ? Orbit
        : n.kind === "Live ship"
          ? Rocket
          : n.kind === "Zone" || n.kind === "Asteroid field"
            ? Diamond
            : n.systemId !== doc.id
              ? Globe2
              : Circle;
    let validDrop = false;
    if (dragged && n.systemId === doc.id && writable && !busy) {
      try {
        reparentMapObject(
          {
            ...doc,
            bodies: doc.bodies.map((b) => ({ ...b })),
            fields: doc.fields.map((f) => ({ ...f })),
            zones: doc.zones?.map((z) => ({ ...z })),
          },
          dragged,
          n.id,
        );
        validDrop = true;
      } catch {
        /* Invalid targets retain their normal styling. */
      }
    }
    return (
      <li key={`${n.systemId}:${n.id}`} role="none">
        <div
          role="treeitem"
          tabIndex={0}
          aria-label={`${n.name} (${n.kind})`}
          aria-selected={selection.includes(n.id)}
          aria-expanded={n.children.length ? expanded : undefined}
          draggable={
            writable &&
            !busy &&
            n.systemId === doc.id &&
            n.id !== doc.id &&
            n.kind !== "Live ship" &&
            n.kind !== "star"
          }
          data-drop-target={over === n.id && validDrop}
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.setData(
              "application/x-sidereal-map-object",
              JSON.stringify({ id: n.id, systemId: n.systemId }),
            );
            e.dataTransfer.effectAllowed = "move";
            setDragged(n.id);
          }}
          onDragEnd={() => {
            setDragged(null);
            setOver(null);
          }}
          onDragOver={(e) => {
            if (
              !e.dataTransfer.types.includes(
                "application/x-sidereal-map-object",
              )
            )
              return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = validDrop ? "move" : "none";
            setOver(n.id);
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOver(null);
            setDragged(null);
            if (!writable || busy) return;
            try {
              const source = JSON.parse(
                e.dataTransfer.getData("application/x-sidereal-map-object"),
              );
              if (source.systemId !== doc.id || n.systemId !== doc.id)
                throw Error(
                  "Move between parents inside the current system. Cross-system transfer is not supported.",
                );
              if (typeof source.id !== "string")
                throw Error("Invalid dragged object.");
              onReparent(source.id, n.id);
            } catch (error) {
              onDropError(String(error));
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.focus();
            if (n.systemId === doc.id)
              onContextMenu(e.clientX, e.clientY, n.id);
          }}
          data-node-id={n.id}
          data-parent-id={n.parent ?? (depth ? n.systemId : "universe")}
          className="map-tree-row"
          style={{ paddingLeft: 6 + depth * 14 }}
          onClick={(e) => {
            if (n.systemId !== doc.id) {
              if (!busy) onLoad(n.systemId, n.id);
            } else onSelect(n.id, e.shiftKey);
          }}
          onDoubleClick={() => onFrame(n.id)}
          onKeyDown={(e) => {
            if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
              e.preventDefault();
              e.stopPropagation();
              if (n.systemId === doc.id) {
                const r = e.currentTarget.getBoundingClientRect();
                onContextMenu(r.left + 15, r.bottom, n.id);
              }
              return;
            }
            if (
              [
                "ArrowDown",
                "ArrowUp",
                "Home",
                "End",
                "ArrowLeft",
                "ArrowRight",
                "Enter",
                " ",
              ].includes(e.key)
            ) {
              e.preventDefault();
              e.stopPropagation();
              const rows = [
                ...e.currentTarget
                  .closest('[role="tree"]')!
                  .querySelectorAll<HTMLElement>('[role="treeitem"]'),
              ];
              const index = rows.indexOf(e.currentTarget);
              if (e.key === "ArrowDown")
                rows[Math.min(rows.length - 1, index + 1)]?.focus();
              if (e.key === "ArrowUp") rows[Math.max(0, index - 1)]?.focus();
              if (e.key === "Home") rows[0]?.focus();
              if (e.key === "End") rows.at(-1)?.focus();
              if (e.key === "ArrowRight") {
                if (expanded && n.children.length) rows[index + 1]?.focus();
                else toggle(n.id, false);
              }
              if (e.key === "ArrowLeft") {
                if (expanded && n.children.length) toggle(n.id, true);
                else
                  rows
                    .find(
                      (r) =>
                        r.dataset.nodeId === e.currentTarget.dataset.parentId,
                    )
                    ?.focus();
              }
              if (e.key === "Enter" || e.key === " ") {
                if (n.systemId !== doc.id) {
                  if (!busy) onLoad(n.systemId, n.id);
                } else onSelect(n.id, e.shiftKey);
              }
            }
          }}
        >
          {n.children.length ? (
            <button
              tabIndex={-1}
              aria-label={`${expanded ? "Collapse" : "Expand"} ${n.name}`}
              className="map-tree-expander"
              onClick={(e) => {
                e.stopPropagation();
                toggle(n.id, expanded);
              }}
            >
              <ChevronRight
                size={13}
                style={{ transform: expanded ? "rotate(90deg)" : undefined }}
              />
            </button>
          ) : (
            <span className="map-tree-spacer" />
          )}
          <Icon
            size={14}
            style={{
              color: n.color ?? (n.kind === "star" ? "#f1b655" : undefined),
            }}
          />
          <span className="map-tree-name">
            {n.name}
            <small>{n.kind}</small>
          </span>
        </div>
        {!!n.children.length && expanded && (
          <ul role="group">
            {n.children.map((child) => render(child, depth + 1, selfMatch))}
          </ul>
        )}
      </li>
    );
  };
  return (
    <div className="map-universe">
      <h2>
        <Globe2 size={16} /> Universe
      </h2>
      <ul role="tree" aria-label="Universe" aria-multiselectable="true">
        {[root, ...others].map((n) => render(n, 0))}
      </ul>
      {![root, ...others].some(matches) && <p>No matching nodes.</p>}
    </div>
  );
}
