/** Database-free review of the production Shipyard palette and plan canvas. */
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import PlanCanvas from "../../apps/dashboard/src/shipyard/prefab/PlanCanvas";
import { ToolPanel } from "../../apps/dashboard/src/shipyard/prefab/ToolPanel";
import { DEFAULT_LAYERS } from "../../apps/dashboard/src/shipyard/prefab/hit-test";
import type { ToolState } from "../../apps/dashboard/src/shipyard/prefab/keymap";
import type { PrefabSelection } from "../../apps/dashboard/src/shipyard/prefab/commands";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import "../../apps/dashboard/src/shipyard/prefab/prefab.css";
import "../../apps/dashboard/src/shipyard/prefab/layout.css";
function App() {
  const [doc, setDoc] = useState(
    PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!,
  );
  const [tools, setTools] = useState<ToolState>({
    tool: "hull",
    volume: "hull",
    shape: "square",
    rot: 0,
    reflected: false,
    bowStep: 2,
    bowAxis: 0,
    roomType: "bridge",
    roomLabel: "",
    edgeType: "canopy",
    component: null,
    mountMode: "top",
    facing: "fore",
    skylight: [2, 2],
    symmetry: false,
    centreline: 3,
  });
  const [selection, select] = useState<PrefabSelection | null>(null);
  const handle = useRef(null);
  const catalog = defaultPrefabComponentCatalog();
  useEffect(() => {
    setTimeout(() => {
      (window as any).__prefabReady = true;
      (window as any).__prefabMetrics = [
        { id: doc.id, view: "production-plan" },
      ];
    }, 500);
  }, []);
  return (
    <>
      <header>
        SHIPYARD / WREN · 1 m grid · bow ends at x = 11 m · full → brow →
        windscreen → cap
      </header>
      <main>
        <aside>
          <ToolPanel
            doc={doc}
            catalog={catalog}
            tools={tools}
            setTools={(patch) => setTools((t) => ({ ...t, ...patch }))}
            commit={(_, d) => setDoc(d)}
          />
        </aside>
        <section className="plan">
          <PlanCanvas
            doc={doc}
            catalog={catalog}
            tools={tools}
            selection={selection}
            select={select}
            layers={{ ...DEFAULT_LAYERS, rooms: false, mounts: false }}
            commit={(_, d) => setDoc(d)}
            onStatus={() => {}}
            handle={handle}
          />
        </section>
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
