import { StudioAuthGate } from "./authoring/StudioAuthGate";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import { THEMES } from "@sidereal/content";
import { ItemSlot, Panel, Readout, Status, ToolButton } from "@sidereal/ui";
import {
  ArrowUpRight,
  BookOpen,
  Box,
  ChartNoAxesCombined,
  DatabaseZap,
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
import { lazy, Suspense, useEffect, useState } from "react";
import { ThemePicker } from "./editor/ThemePicker";
import { WorkspaceBoundary } from "./editor/WorkspaceBoundary";
import "./editor/theme.css";
import "./style.css";
const MapEditor = lazy(() => import("./map-editor/MapEditor"));
const PlanetStudio = lazy(() => import("./planet-studio/PlanetStudio"));
const PrefabShipyard = lazy(() => import("./shipyard/prefab/PrefabShipyard"));
const DefinitionsWorkspace = lazy(
  () => import("./definitions/DefinitionsWorkspace"),
);
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
  "map" | "planets" | "dashboard" | "prefabs" | "components" | "definitions";
const ROUTE_PATHS: Partial<Record<Route, string>> = {
  dashboard: "/",
  prefabs: "/shipyard/prefabs",
};
/** The prefab Shipyard is the Shipyard: `/shipyard` and its old sub-paths open it. */
const currentRoute = (): Route =>
  location.pathname === "/map"
    ? "map"
    : location.pathname.includes("shipyard")
      ? "prefabs"
      : location.pathname.includes("planets")
        ? "planets"
        : location.pathname.startsWith("/definitions")
          ? "definitions"
          : location.pathname.includes("components")
            ? "components"
            : "dashboard";
export default function App() {
  return (
    <StudioAuthGate>
      <StudioApp />
    </StudioAuthGate>
  );
}
function StudioApp() {
  const [route, setRoute] = useState<Route>(currentRoute);
  const [toolDetail, setToolDetail] = useState<(typeof tools)[number] | null>(
    null,
  );
  useEffect(() => {
    const pop = () => setRoute(currentRoute());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const navigate = (next: Route) => {
    history.pushState({}, "", ROUTE_PATHS[next] ?? `/${next}`);
    setRoute(next);
  };
  const clientUrl = new URL(window.location.href);
  clientUrl.port = import.meta.env.VITE_CLIENT_PORT;
  clientUrl.pathname = "/";
  clientUrl.search = "";
  clientUrl.hash = "";
  return (
    <div className="app">
      <div className="workspace">
        <nav className="rail studio-rail" aria-label="Creator workspaces">
          <a
            className="studio-mark"
            href="/"
            aria-label="Sidereal Creator home"
            title="Sidereal Creator"
            onClick={(e) => {
              e.preventDefault();
              navigate("dashboard");
            }}
          >
            <Orbit size={26} />
          </a>
          <ToolButton
            label="Workspaces"
            active={route === "dashboard"}
            onClick={() => navigate("dashboard")}
          >
            <LayoutGrid />
          </ToolButton>
          <ToolButton
            label="Shipyard"
            active={route === "prefabs"}
            onClick={() => navigate("prefabs")}
          >
            <Ship />
          </ToolButton>
          <ToolButton
            label="Map editor"
            active={route === "map"}
            onClick={() => navigate("map")}
          >
            <Compass />
          </ToolButton>
          <ToolButton
            label="Genesis"
            active={route === "planets"}
            onClick={() => navigate("planets")}
          >
            <FlaskConical />
          </ToolButton>
          <ToolButton
            label="Definitions"
            active={route === "definitions"}
            onClick={() => navigate("definitions")}
          >
            <DatabaseZap />
          </ToolButton>
          <span className="rail-spacer" />
          <a
            className="tool-button"
            aria-label="Open game"
            title="Open game"
            href={import.meta.env.VITE_CLIENT_URL ?? clientUrl.href}
          >
            <ArrowUpRight />
          </a>
          <ThemePicker />
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
        </nav>
        <WorkspaceBoundary key={route}>
          <Suspense
            fallback={
              <div className="workspace-loading" role="status">
                Loading workspace…
              </div>
            }
          >
            {route === "map" ? (
              <MapEditor />
            ) : route === "planets" ? (
              <PlanetStudio />
            ) : route === "prefabs" ? (
              <PrefabShipyard />
            ) : route === "definitions" ? (
              <DefinitionsWorkspace />
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
                          title === "Firmament" || title === "World explorer"
                            ? navigate("map")
                            : title === "Shipyard"
                              ? navigate("prefabs")
                              : title === "Genesis"
                                ? navigate("planets")
                                : title === "Foundry"
                                  ? navigate("definitions")
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
                          {title === "Firmament" || title === "World explorer"
                            ? "Map editor"
                            : title === "Shipyard"
                              ? "Prefab Shipyard ready"
                              : title === "Genesis"
                                ? "Generator ready"
                                : title === "Foundry"
                                  ? "Definitions: items and weapons"
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
    </div>
  );
}
