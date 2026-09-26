import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import { LAYERS, THEMES } from "@sidereal/content";
import { ItemSlot, Panel, Readout, Status, ToolButton } from "@sidereal/ui";
import {
  ArrowUpRight,
  BookOpen,
  Box,
  ChartNoAxesCombined,
  Code2,
  Compass,
  FlaskConical,
  Layers,
  LayoutGrid,
  MousePointer2,
  Move,
  Music2,
  Orbit,
  Palette,
  Redo2,
  RotateCw,
  Shield,
  Ship,
  Undo2,
  Users,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { PILOT_LAYOUT } from "@sidereal/content/pilot-layout";
import { ThemePicker } from "./editor/ThemePicker";
import { WorkspaceBoundary } from "./editor/WorkspaceBoundary";
import "./editor/theme.css";
import "./style.css";
const AssemblyEditor = lazy(() => import("./shipyard/AssemblyEditor"));
const LayoutEditor = lazy(() => import("./shipyard/layout/LayoutEditor"));
const PlanetStudio = lazy(() => import("./planet-studio/PlanetStudio"));
const PrefabShipyard = lazy(() => import("./shipyard/prefab/PrefabShipyard"));
const tools = [
  [
    "World explorer",
    Orbit,
    "Live entity inspection, selection and authorized editing.",
    "M3",
  ],
  [
    "Firmament",
    Compass,
    "Galaxy baselines, procedural zones, placement and seed controls.",
    "M8",
  ],
  [
    "Shipyard",
    Ship,
    "Modular rooms, equipment, armor, roofs, markings and utility routes.",
    "M3",
  ],
  [
    "Foundry",
    Box,
    "Entity packages, components, blueprints and lifecycle hooks.",
    "M3",
  ],
  [
    "Genesis",
    FlaskConical,
    "Planet and asteroid generation, material preview and packages.",
    "M8",
  ],
  [
    "Materials",
    Palette,
    "PBR materials, shaders, effects, parameter schemas and previews.",
    "M8",
  ],
  [
    "Atelier",
    Layers,
    "Blender meshes, sockets, collision shapes, LOD and asset validation.",
    "M2",
  ],
  [
    "Scripts",
    Code2,
    "Versioned code, lifecycle events, validation and audit.",
    "M3",
  ],
  [
    "Sound studio",
    Music2,
    "Audio assets, waveform/cue editing, buses and spatial preview.",
    "M8",
  ],
  [
    "Accounts & security",
    Shield,
    "Characters, MFA, roles, permissions, grants and moderation.",
    "M1",
  ],
  [
    "Factions",
    Users,
    "Membership, relationships, storage permissions and content access.",
    "M5",
  ],
  [
    "Metrics",
    ChartNoAxesCombined,
    "Tick budgets, subscriptions, memory, failures and audit.",
    "M9",
  ],
] as const;
type Route =
  | "planets"
  | "dashboard"
  | "shipyard"
  | "prefabs"
  | "assembly"
  | "models"
  | "components";
const ROUTE_PATHS: Partial<Record<Route, string>> = {
  dashboard: "/",
  prefabs: "/shipyard/prefabs",
};
const currentRoute = (): Route =>
  location.pathname.startsWith("/shipyard/prefabs")
    ? "prefabs"
    : location.pathname.includes("shipyard") &&
  new URLSearchParams(location.search).has("assembly")
    ? "assembly"
    : location.pathname.includes("planets")
      ? "planets"
      : location.pathname.includes("models")
        ? "models"
        : location.pathname.includes("shipyard")
          ? "shipyard"
          : location.pathname.includes("components")
            ? "components"
            : "dashboard";
export default function App() {
  const [route, setRoute] = useState<Route>(currentRoute);
  const [toolDetail, setToolDetail] = useState<(typeof tools)[number] | null>(
    null,
  );
  const [interior, setInterior] = useState(false);
  const [source, setSource] = useState<
    "voxel" | "original" | "engine-original" | "engine-voxel"
  >("voxel");
  const [inspect, setInspect] = useState(false);
  const [modelStatus, setModelStatus] = useState("Loading Blender study");
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<Awaited<
    ReturnType<(typeof import("@sidereal/render"))["createWorld"]>
  > | null>(null);
  const state = useRef({
    heading: 0,
    x: 0,
    y: 0,
    localX: 0,
    localY: PILOT_LAYOUT.station.y,
    interior,
    inspect,
    grid: true,
  });
  useEffect(() => {
    const pop = () => setRoute(currentRoute());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const navigate = (next: Route) => {
    history.pushState({}, "", ROUTE_PATHS[next] ?? `/${next}`);
    setRoute(next);
  };
  useEffect(() => {
    const target = canvas.current;
    if (route !== "models" || !target) return;
    let disposed = false;
    import("@sidereal/render")
      .then(({ createWorld }) =>
        createWorld(target, setModelStatus, { source }),
      )
      .then((v) => {
        if (disposed) v.dispose();
        else {
          view.current = v;
          v.update(state.current);
        }
      })
      .catch((e) => setModelStatus(String(e)));
    return () => {
      disposed = true;
      view.current?.dispose();
      view.current = null;
    };
  }, [route, source]);
  useEffect(() => {
    state.current = { ...state.current, interior, inspect };
    view.current?.update(state.current);
  }, [interior, inspect]);
  const clientUrl = new URL(window.location.href);
  clientUrl.port = import.meta.env.VITE_CLIENT_PORT;
  clientUrl.pathname = "/";
  clientUrl.search = "";
  clientUrl.hash = "";
  return (
    <div className="app">
      <header className="app-header">
        <a
          href="/"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("dashboard");
          }}
        >
          <span className="brand-symbol">
            <Orbit size={26} />
          </span>
          Sidereal<span className="edition">Creator</span>
        </a>
        <nav aria-label="Workspace">
          <button
            className={route === "dashboard" ? "selected" : ""}
            onClick={() => navigate("dashboard")}
          >
            Workspaces
          </button>
          <button
            className={
              route === "shipyard" || route === "assembly" ? "selected" : ""
            }
            onClick={() => navigate("shipyard")}
          >
            Shipyard
          </button>
          <button
            className={route === "prefabs" ? "selected" : ""}
            onClick={() => navigate("prefabs")}
          >
            Prefab ships
          </button>
          <button
            className={route === "planets" ? "selected" : ""}
            onClick={() => navigate("planets")}
          >
            Genesis
          </button>
          <a
            className="nav-link"
            href={
              import.meta.env.VITE_CLIENT_URL ??
              (window.location.protocol === "https:"
                ? import.meta.env.VITE_PUBLIC_CLIENT_URL
                : clientUrl.href)
            }
          >
            Open game <ArrowUpRight size={14} />
          </a>
        </nav>
        <div className="account">
          <ThemePicker />
        </div>
      </header>
      <div className="workspace">
        <aside className="rail" aria-label="Creator tools">
          <ToolButton
            label="Workspaces"
            active={route === "dashboard"}
            onClick={() => navigate("dashboard")}
          >
            <LayoutGrid />
          </ToolButton>
          <ToolButton
            label="Shipyard"
            active={route === "shipyard" || route === "assembly"}
            onClick={() => navigate("shipyard")}
          >
            <Ship />
          </ToolButton>
          <span className="rail-spacer" />
          <ToolButton
            label="UI component workshop"
            active={route === "components"}
            onClick={() => navigate("components")}
          >
            <Palette />
          </ToolButton>
          <a
            className="tool-button"
            href="/help/shipyard.md"
            target="_blank"
            aria-label="Read Shipyard help"
          >
            <BookOpen />
          </a>
        </aside>
        <WorkspaceBoundary key={route}>
          <Suspense
            fallback={
              <div className="workspace-loading" role="status">
                Loading workspace…
              </div>
            }
          >
            {route === "planets" ? (
              <PlanetStudio />
            ) : route === "prefabs" ? (
              <PrefabShipyard />
            ) : route === "shipyard" || route === "assembly" ? (
              route === "assembly" ? (
                <AssemblyEditor />
              ) : (
                <LayoutEditor />
              )
            ) : route === "models" ? (
              <>
                <main className="viewport editor">
                  <canvas
                    ref={canvas}
                    tabIndex={0}
                    aria-label="3D ship assembly preview"
                  />
                  <div className="view-heading">
                    <div>
                      <span className="muted">Shipyard · assembly study</span>
                      <h1>Wayfarer</h1>
                      <span className="ship-class">
                        Imported Blender geometry
                      </span>
                    </div>
                    <div className="view-actions">
                      <ToolButton
                        label="Inspect 3D angle"
                        active={inspect}
                        onClick={() => setInspect((v) => !v)}
                      >
                        <Orbit />
                      </ToolButton>
                    </div>
                  </div>
                  <div className="canvas-tools">
                    <ToolButton label="Inspect assembly" active>
                      <MousePointer2 />
                    </ToolButton>
                    <ToolButton label="Placement tools arrive in M3" disabled>
                      <Move />
                    </ToolButton>
                    <ToolButton label="Rotation tools arrive in M3" disabled>
                      <RotateCw />
                    </ToolButton>
                  </div>
                  <div className="view-footer">
                    <span>{modelStatus}</span>
                    <span>Geometry review · editing arrives in M3</span>
                  </div>
                </main>
                <aside className="inspector">
                  <Panel title="Review display">
                    <label>
                      Source model
                      <select
                        aria-label="Source model"
                        value={source}
                        onChange={(e) =>
                          setSource(
                            e.target.value as
                              | "voxel"
                              | "original"
                              | "engine-original"
                              | "engine-voxel",
                          )
                        }
                      >
                        <option value="voxel">Voxel Wayfarer</option>
                        <option value="original">
                          Original Blender assembly
                        </option>
                        <option value="engine-original">
                          Engine · Blender source
                        </option>
                        <option value="engine-voxel">
                          Engine · Voxelized result
                        </option>
                      </select>
                    </label>
                    <button
                      className="layer"
                      onClick={() => setInterior(false)}
                    >
                      Exterior shell <span>{!interior ? "Visible" : ""}</span>
                    </button>
                    <button className="layer" onClick={() => setInterior(true)}>
                      Interior cutaway <span>{interior ? "Visible" : ""}</span>
                    </button>
                  </Panel>
                  <Panel title="Planned assembly layers">
                    {LAYERS.map((layer) => (
                      <button className="layer" disabled key={layer}>
                        <Layers size={15} />
                        {layer}
                        <span>M3</span>
                      </button>
                    ))}
                  </Panel>
                  <Panel title="Authoring contract">
                    <p className="fine-print">
                      Part placement, mounting rules, undo, persistent drafts
                      and live refits are specified in the implementation plan.
                    </p>
                    <a
                      className="secondary full"
                      href="/help/shipyard.md"
                      target="_blank"
                    >
                      Read Shipyard help
                    </a>
                  </Panel>
                </aside>
              </>
            ) : route === "dashboard" ? (
              <main className="dashboard">
                <div className="page-heading">
                  <div>
                    <span className="muted">Creator workspace</span>
                    <h1>Build a living universe.</h1>
                    <p>
                      The authoring suite, rebuilt around one persistent world.
                    </p>
                  </div>
                  <a
                    href="/help/shipyard.md"
                    target="_blank"
                    className="secondary"
                  >
                    Open Shipyard help <ArrowUpRight size={17} />
                  </a>
                </div>
                <div className="suite-list">
                  {tools.map((tool) => {
                    const [title, Icon, description, milestone] = tool;
                    return (
                      <button
                        key={title}
                        className="suite-row"
                        onClick={() =>
                          title === "Shipyard"
                            ? navigate("shipyard")
                            : title === "Genesis"
                              ? navigate("planets")
                              : setToolDetail(tool)
                        }
                      >
                        <span className="suite-icon">
                          <Icon size={24} />
                        </span>
                        <div>
                          <h2>{title}</h2>
                          <p>{description}</p>
                        </div>
                        <Status>
                          {title === "Shipyard"
                            ? "Layout planner ready"
                            : title === "Genesis"
                              ? "Generator ready"
                              : milestone + " planned"}
                        </Status>
                        <ArrowUpRight size={18} />
                      </button>
                    );
                  })}
                </div>
                {toolDetail && (
                  <dialog open className="detail-dialog">
                    <button
                      className="close"
                      onClick={() => setToolDetail(null)}
                    >
                      Close
                    </button>
                    <h2>{toolDetail[0]}</h2>
                    <p>{toolDetail[2]}</p>
                    <p>
                      This workspace is scoped for {toolDetail[3]}. See the
                      authoring contract for the required reducers, UI and
                      acceptance tests.
                    </p>
                    <a href="/help/shipyard.md" target="_blank">
                      Read authoring contract
                    </a>
                  </dialog>
                )}
              </main>
            ) : (
              <main className="dashboard">
                <div className="page-heading">
                  <div>
                    <span className="muted">Design workshop</span>
                    <h1>Instruments with a purpose.</h1>
                    <p>
                      New components for the flight deck, interiors and creator
                      tools.
                    </p>
                  </div>
                </div>
                <div className="component-grid">
                  <Panel title="Status & telemetry">
                    <Status good>Connected</Status>
                    <Status>Awaiting input</Status>
                    <Readout label="Reservoir capacity" value="120" unit="kg" />
                  </Panel>
                  <Panel title="Equipment slots">
                    <div className="slot-grid">
                      {[
                        "Helmet",
                        "Suit",
                        "Primary",
                        "Utility",
                        "Backpack",
                        "Boots",
                      ].map((s, i) => (
                        <ItemSlot key={s} label={s}>
                          {i === 0 ? (
                            <Shield size={23} />
                          ) : i === 2 ? (
                            <Box size={23} />
                          ) : undefined}
                        </ItemSlot>
                      ))}
                    </div>
                    <p className="fine-print">
                      UI specimens; no inventory mutation is connected yet.
                    </p>
                  </Panel>
                  <Panel title="Toolbar">
                    <div className="tool-samples">
                      <ToolButton label="Select" active>
                        <MousePointer2 />
                      </ToolButton>
                      <ToolButton label="Move">
                        <Move />
                      </ToolButton>
                      <ToolButton label="Rotate">
                        <RotateCw />
                      </ToolButton>
                      <ToolButton label="Undo">
                        <Undo2 />
                      </ToolButton>
                      <ToolButton label="Redo">
                        <Redo2 />
                      </ToolButton>
                    </div>
                  </Panel>
                  <Panel title="Faction material families">
                    {THEMES.map((t) => (
                      <p key={t}>{t}</p>
                    ))}
                  </Panel>
                </div>
              </main>
            )}
          </Suspense>
        </WorkspaceBoundary>
      </div>
      <footer className="app-footer">
        <span>Sidereal Creator 0.1</span>
        <span>New UI · authoring tools are planned phases</span>
        <span>Independent dashboard</span>
      </footer>
    </div>
  );
}
