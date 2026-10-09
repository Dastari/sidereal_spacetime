/** Offline review of the exact production inspection window; no database or auth. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { EngineStore } from "@babylonjs/core/Engines/engineStore";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import { HULL_ACCESS_SOURCE } from "@sidereal/content/hull-access-profile";
import SystemsDesignView from "../../apps/client/src/SystemsDesignView";
const source = {
  doc: HULL_ACCESS_SOURCE,
  catalogRevision: "ship-components-v1@4",
};
Object.assign(window, {
  __systemsFixture: {
    render: () => {
      for (const engine of EngineStore.Instances)
        for (const scene of engine.scenes) scene.render();
    },
    stats: () => ({
      engines: EngineStore.Instances.length,
      canvases: document.querySelectorAll("canvas").length,
      equipmentModels: new Set(
        EngineStore.Instances.flatMap((e) =>
          e.scenes.flatMap((s) =>
            s.meshes
              .filter(
                (m) => m.metadata?.componentId && !m.name.startsWith("port:"),
              )
              .map((m) => m.metadata?.componentId),
          ),
        ),
      ).size,
      visibleEquipment: new Set(
        EngineStore.Instances.flatMap((e) =>
          e.scenes.flatMap((s) =>
            s.meshes
              .filter(
                (m) =>
                  m.metadata?.componentId &&
                  !m.name.startsWith("port:") &&
                  m.isEnabled(),
              )
              .map((m) => m.metadata.componentId),
          ),
        ),
      ).size,
      highlighted: [
        ...new Set(
          EngineStore.Instances.flatMap((e) =>
            e.scenes.flatMap((s) =>
              s.meshes
                .filter(
                  (m) =>
                    m.metadata?.componentId && m.renderOutline && m.isEnabled(),
                )
                .map((m) => m.metadata.componentId),
            ),
          ),
        ),
      ].sort(),
      activeRoutes: EngineStore.Instances.flatMap((e) =>
        e.scenes.flatMap((s) =>
          s.meshes
            .filter((m) => m.name.startsWith("service:") && m.isEnabled())
            .map((m) => m.name),
        ),
      ),
      contextEnabled: EngineStore.Instances[0]?.scenes[0]
        ?.getTransformNodeByName("systems-deck-context")
        ?.isEnabled(),
    }),
  },
});
function Fixture() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open systems design</button>
      {open && (
        <SystemsDesignView source={source} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
document.body.style.cssText =
  "margin:0;background:#0c1420;font-family:Barlow,sans-serif;color:#e5edf4";
createRoot(document.getElementById("root")!).render(<Fixture />);
