import React, { useEffect, useRef, useState } from "react";
import {
  Orbit,
  Compass,
  Layers,
  Box,
  ArrowUpRight,
  MousePointer2,
  RotateCw,
  Move,
  LayoutGrid,
  FlaskConical,
  Code2,
  Music2,
  Palette,
  Shield,
  Users,
  ChartNoAxesCombined,
  BookOpen,
  Undo2,
  Redo2,
  Ship,
} from "lucide-react";
import { Panel, Readout, Status, ToolButton, ItemSlot } from "@sidereal/ui";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "./style.css";
import {
  connect,
  type DbConnection,
  type ShipRow,
  type CharacterRow,
  type StationRow,
} from "@sidereal/net";
export default function App() {
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState("");
  const [revision, refresh] = useState(0);
  const [interior, setInterior] = useState(false);
  const [inspect, setInspect] = useState(false);
  const [modelStatus, setModelStatus] = useState("Loading Blender study");
  const [name, setName] = useState("Captain");
  const [shipName, setShipName] = useState("");
  const [saving, setSaving] = useState(false);
  const connection = useRef<DbConnection | null>(null);
  const sequence = useRef(BigInt(Date.now()) * 1000n);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<Awaited<
    ReturnType<(typeof import("@sidereal/render"))["createWorld"]>
  > | null>(null);
  const sceneState = useRef({
    heading: 0,
    x: 0,
    y: 0,
    localX: 0,
    localY: 6,
    interior: false,
    inspect: false,
    grid: false,
  });
  useEffect(() => {
    const c = connect(
      () => refresh((v) => v + 1),
      (s, e) => {
        setStatus(s);
        if (e) setError(e);
      },
    );
    connection.current = c;
    return () => c.disconnect();
  }, []);
  const c = connection.current;
  const ship = (c ? [...c.db.ownShips.iter()][0] : undefined) as
    ShipRow | undefined;
  const actor = (c ? [...c.db.ownCharacters.iter()][0] : undefined) as
    CharacterRow | undefined;
  const station = (c ? [...c.db.ownStations.iter()][0] : undefined) as
    StationRow | undefined;
  const seated = Boolean(actor && station?.occupantId === actor.id);
  const ready = status === "ready";
  useEffect(() => {
    if (actor && ready && !actor.connected)
      c?.reducers
        .enterLab({ name: actor.name })
        .catch((e) => setError(String(e)));
  }, [actor?.connected, ready]);
  useEffect(() => {
    if (ship) setShipName(ship.name);
  }, [ship?.name]);
  useEffect(() => {
    let disposed = false;
    if (!canvas.current) return;
    import("@sidereal/render")
      .then(({ createWorld }) => createWorld(canvas.current!, setModelStatus))
      .then((result) => {
        if (disposed) result.dispose();
        else {
          view.current = result;
          result.update(sceneState.current);
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      disposed = true;
      view.current?.dispose();
      view.current = null;
    };
  }, []);
  useEffect(() => {
    sceneState.current = {
      heading: ship?.heading ?? 0,
      x: ship?.x ?? 0,
      y: ship?.y ?? 0,
      localX: actor?.localX ?? 0,
      localY: actor?.localY ?? 6,
      interior,
      inspect,
      grid: false,
    };
    view.current?.update(sceneState.current);
  }, [revision, interior, inspect]);
  useEffect(() => {
    const keys = new Set<string>();
    const inputTarget = () =>
      ["INPUT", "TEXTAREA", "SELECT"].includes(
        document.activeElement?.tagName ?? "",
      );
    const send = () => {
      if (!connection.current || !actor?.connected) return;
      const vertical = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
      const horizontal =
        (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
      connection.current.reducers
        .setIntent({
          sequence: ++sequence.current,
          throttle: seated && !interior ? vertical : 0,
          turn: seated && !interior ? -horizontal : 0,
          dx: !seated && interior ? vertical : 0,
          dy: !seated && interior ? -horizontal : 0,
        })
        .catch((e) => setError(String(e)));
    };
    const down = (e: KeyboardEvent) => {
      if (inputTarget()) return;
      if (e.code === "Tab") {
        e.preventDefault();
        if (!e.repeat) setInterior((v) => !v);
        return;
      }
      if (e.code === "KeyE" && !e.repeat) {
        connection.current?.reducers
          .useStation({})
          .catch((e) => setError(String(e)));
        return;
      }
      if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) {
        e.preventDefault();
        keys.add(e.code);
      }
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    const blur = () => {
      keys.clear();
      send();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    const interval = setInterval(send, 50);
    return () => {
      clearInterval(interval);
      keys.clear();
      send();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [actor?.connected, seated, interior]);
  const rename = async () => {
    if (!ship || !c) return;
    setSaving(true);
    setError("");
    try {
      await c.reducers.renameShip({
        shipId: ship.id,
        name: shipName,
        expectedRevision: ship.revision,
        operationId:
          crypto.randomUUID?.() ??
          `edit-${Date.now()}-${Array.from(crypto.getRandomValues(new Uint32Array(2))).join("-")}`,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };
  const speed = ship ? Math.hypot(ship.vx, ship.vy) : 0;
  const dashboardUrl = new URL(window.location.href);
  dashboardUrl.port = import.meta.env.VITE_DASHBOARD_PORT;
  dashboardUrl.pathname = "/";
  dashboardUrl.search = "";
  dashboardUrl.hash = "";
  return (
    <div className="app">
      <header className="app-header">
        <a href="/" className="brand">
          <span className="brand-symbol">
            <Orbit size={26} />
          </span>
          Sidereal<span className="edition">Spacetime</span>
        </a>
        <nav aria-label="Workspace">
          <button className="selected">Flight deck</button>
          <a
            className="nav-link"
            href={import.meta.env.VITE_DASHBOARD_URL ?? dashboardUrl.href}
          >
            Creator workspace <ArrowUpRight size={14} />
          </a>
        </nav>
        <div className="account">
          <Status good={ready}>
            {ready ? "Local world connected" : status}
          </Status>
          <span>{actor?.name ?? "Development lab"}</span>
        </div>
      </header>
      <div className="workspace">
        <aside className="rail" aria-label="Tools">
          <ToolButton label="Flight deck" active>
            <Compass />
          </ToolButton>
          <a
            className="tool-button"
            href={import.meta.env.VITE_DASHBOARD_URL ?? dashboardUrl.href}
            aria-label="Open separate creator app"
          >
            <LayoutGrid />
          </a>
          <span className="rail-spacer" />
          <a
            className="tool-button"
            href="/PIVOT.md"
            target="_blank"
            aria-label="Read pivot plan"
          >
            <BookOpen />
          </a>
        </aside>{" "}
        <main className="viewport">
          <canvas ref={canvas} aria-label="Top-down 3D ship viewport" />
          <div className="view-heading">
            <div>
              <span className="muted">Personal flight laboratory</span>
              <h1>{ship?.name ?? "Wayfarer"}</h1>
              <span className="ship-class">Frontier utility vessel</span>
            </div>
            <div className="view-actions">
              <button
                className={interior ? "selected" : ""}
                onClick={() => setInterior((v) => !v)}
              >
                <Layers size={16} />
                {interior ? "Cabin study" : "Blender assembly"}
              </button>
              <ToolButton
                label="Inspect 3D angle"
                active={inspect}
                onClick={() => setInspect((v) => !v)}
              >
                <Orbit size={18} />
              </ToolButton>
            </div>
          </div>
          {!actor && (
            <form
              className="entry-card"
              onSubmit={(e) => {
                e.preventDefault();
                c?.reducers
                  .enterLab({ name })
                  .catch((e) => setError(String(e)));
              }}
            >
              <h2>Take the controls.</h2>
              <p>Create a persistent test character and a private ship.</p>
              <label>
                Character name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={2}
                  maxLength={40}
                />
              </label>
              <button className="primary" disabled={!ready}>
                Enter flight lab <ArrowUpRight size={17} />
              </button>
              <small>
                This local identity is separate from your original account.
              </small>
            </form>
          )}
          {actor && interior && (
            <button
              className="action-prompt"
              onClick={() =>
                c?.reducers.useStation({}).catch((e) => setError(String(e)))
              }
            >
              <kbd>E</kbd>
              {seated
                ? "Leave control seat"
                : Math.hypot(actor.localX, actor.localY - 6) <= 1.8
                  ? "Use control station"
                  : "Approach control station"}
            </button>
          )}
          <div className="view-footer">
            <span>
              <i className="live-dot" />
              {modelStatus}
            </span>
            <span>
              {interior ? "Cabin collision study" : "3D assembly study"}
              <span className="divider">/</span>
              TAB changes view
            </span>
          </div>
        </main>
        <aside className="inspector">
          <Panel title="Vessel">
            <div className="vessel-title">
              <Ship size={27} />
              <div>
                <strong>{ship?.name ?? "Wayfarer"}</strong>
                <span>
                  {seated
                    ? "Control station occupied"
                    : "Control station available"}
                </span>
              </div>
            </div>
            <div className="readouts">
              <Readout label="Speed" value={speed.toFixed(1)} unit="m/s" />
              <Readout
                label="Mass"
                value={ship ? (ship.massKg / 1000).toFixed(1) : "12.0"}
                unit="t"
              />
              <Readout
                label="Heading"
                value={
                  ship
                    ? (
                        ((((ship.heading * 180) / Math.PI) % 360) + 360) %
                        360
                      ).toFixed(0)
                    : "0"
                }
                unit="°"
              />
              <Readout
                label="Thrust capacity"
                value={ship ? (ship.thrustN / 1000).toFixed(0) : "36"}
                unit="kN"
              />
            </div>
            <p className="fine-print">
              Fixture mass and thrust. Installed-part compilation is scheduled
              for M2.
            </p>
          </Panel>
          <Panel title="Flight controls">
            <div className="key-row">
              <kbd>W</kbd>
              <kbd>S</kbd>
              <span>Forward / reverse thrust</span>
            </div>
            <div className="key-row">
              <kbd>A</kbd>
              <kbd>D</kbd>
              <span>Rotate ship</span>
            </div>
            <div className="key-row">
              <kbd>E</kbd>
              <span>Enter / leave seat</span>
            </div>
            <p className="fine-print">
              In the cabin, WASD walks while out of the seat. Releasing thrust
              preserves momentum.
            </p>
          </Panel>
          <Panel
            title="Live identity"
            action={<Status>r{ship?.revision.toString() ?? "—"}</Status>}
          >
            <label>
              Vessel name
              <input
                value={shipName}
                onChange={(e) => setShipName(e.target.value)}
                disabled={!ship}
                maxLength={48}
              />
            </label>
            <button
              className="secondary full"
              disabled={!ship || saving || shipName === ship.name}
              onClick={rename}
            >
              {saving ? "Applying…" : "Apply to live ship"}
            </button>
            <p className="fine-print">
              Revision-checked and saved by the authority. Blueprint editing
              arrives in M3.
            </p>
            <span className="receipt">
              {c ? [...c.db.ownEditReceipts.iter()].length : 0} persistent edit
              receipts
            </span>
          </Panel>
        </aside>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      <footer className="app-footer">
        <span>Sidereal Spacetime 0.1</span>
        <span>Flight laboratory · foundation build</span>
        <span>Independent game client</span>
      </footer>
    </div>
  );
}
