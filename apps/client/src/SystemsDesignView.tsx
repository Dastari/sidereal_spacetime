import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SHIP_COMPONENT_CHANNEL_UNITS } from "@sidereal/content/ship-components";
import {
  buildSystemsDesign,
  DESIGN_CHANNELS,
  type DesignChannel,
  type SystemsDesign,
} from "@sidereal/sim/ship-systems-design";
import type { SystemsDesignSource } from "./systems-design-source";
import "./systems-design.css";

type Renderer = ReturnType<
  typeof import("@sidereal/render/ship-systems-design").createSystemsDesignView
>;
const CHANNELS: Record<DesignChannel, { name: string; color: string }> = {
  power: { name: "Power", color: "#f2a75b" },
  data: { name: "Data", color: "#aa97f7" },
  coolant: { name: "Coolant", color: "#55d1df" },
  fuel: { name: "Fuel", color: "#ed7186" },
  ventilation: { name: "Ventilation", color: "#91c879" },
};
export default function SystemsDesignView({
  source,
  onClose,
}: {
  source: SystemsDesignSource;
  onClose: () => void;
}) {
  const result = useMemo(() => {
    try {
      return {
        model: buildSystemsDesign(source.doc, source.catalogRevision),
        error: "",
      };
    } catch (e) {
      return {
        model: undefined,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }, [source]);
  return createPortal(
    <DesignWindow
      source={source}
      model={result.model}
      modelError={result.error}
      onClose={onClose}
    />,
    document.body,
  );
}
function DesignWindow({
  source,
  model,
  modelError,
  onClose,
}: {
  source: SystemsDesignSource;
  model: SystemsDesign | undefined;
  modelError: string;
  onClose: () => void;
}) {
  const windowRef = useRef<HTMLElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    view = useRef<Renderer | null>(null);
  const [selected, setSelected] = useState(
    () =>
      model?.components.find((c) => c.id === "mount:reactor")?.id ??
      model?.components[0]?.id,
  );
  const [belowOnly, setBelowOnly] = useState(true),
    [channels, setChannels] = useState<DesignChannel[]>(["power"]),
    [deck, setDeck] = useState<"hidden" | "lifted">("hidden");
  const [status, setStatus] = useState("Starting systems inspection…"),
    [error, setError] = useState(modelError);
  const latest = useRef({ selected, channels, deck, belowOnly });
  latest.current = { selected, channels, deck, belowOnly };
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const el = windowRef.current;
    el?.querySelector<HTMLButtonElement>("[data-design-close]")?.focus();
    return () => {
      if (before?.isConnected) before.focus();
    };
  }, []);
  useEffect(() => {
    if (!model || !canvas.current) return;
    let cancelled = false;
    let renderer: Renderer | undefined;
    import("@sidereal/render/ship-systems-design")
      .then((mod) => {
        if (cancelled || !canvas.current) return;
        renderer = mod.createSystemsDesignView(
          canvas.current,
          source.doc,
          source.catalogRevision,
          model,
          { onSelect: setSelected, onStatus: setStatus, onError: setError },
        );
        view.current = renderer;
        renderer.select(latest.current.selected);
        renderer.setChannels(latest.current.channels);
        renderer.setDeck(latest.current.deck);
        renderer.setBelowOnly(latest.current.belowOnly);
        // The fixture inspects this exact production controller, not a separate mock viewer.
        canvas.current.dataset.designSource = model.sourceHash;
      })
      .catch((e) => {
        if (!cancelled) {
          setStatus("");
          setError(
            `3D inspection is unavailable. You can still inspect equipment and ports. ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      });
    return () => {
      cancelled = true;
      renderer?.dispose();
      view.current = null;
    };
  }, [source, model]);
  useEffect(() => view.current?.select(selected), [selected]);
  useEffect(() => view.current?.setChannels(channels), [channels]);
  useEffect(() => view.current?.setDeck(deck), [deck]);
  useEffect(() => view.current?.setBelowOnly(belowOnly), [belowOnly]);
  const component = model?.components.find((c) => c.id === selected);
  const visible =
    model?.components.filter((c) => !belowOnly || c.belowDeck) ?? [];
  const connected =
    model?.routes.filter(
      (r) =>
        r.from.startsWith(`${selected}/`) || r.to.startsWith(`${selected}/`),
    ) ?? [];
  const nameOf = (endpoint: string) => {
    const c = model?.components.find((c) => endpoint.startsWith(`${c.id}/`));
    return c ? `${c.name} (${c.id.replace("mount:", "")})` : endpoint;
  };
  const toggle = (ch: DesignChannel) =>
    setChannels((old) =>
      old.includes(ch) ? old.filter((x) => x !== ch) : [...old, ch],
    );
  return (
    <div
      className="systems-design-backdrop"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <section
        ref={windowRef}
        className="systems-design-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="systems-design-title"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
          if (e.key === "Tab") {
            const controls = [
              ...e.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
              ),
            ];
            const first = controls[0],
              last = controls.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header className="systems-design-header">
          <div>
            <h2 id="systems-design-title">Systems design</h2>
            <p>
              {source.doc.name} <span>Read-only inspection</span>
            </p>
          </div>
          <button
            data-design-close
            aria-label="Close systems design"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="systems-design-toolbar">
          <div role="group" aria-label="Deck visibility">
            <button
              aria-pressed={deck === "hidden"}
              onClick={() => setDeck("hidden")}
            >
              Reveal machinery
            </button>
            <button
              aria-pressed={deck === "lifted"}
              onClick={() => setDeck("lifted")}
            >
              Lift deck
            </button>
          </div>
          <div
            className="systems-channel-toggles"
            role="group"
            aria-label="Service channels"
          >
            {DESIGN_CHANNELS.map((ch) => (
              <button
                key={ch}
                style={
                  {
                    "--channel-color": CHANNELS[ch].color,
                  } as React.CSSProperties
                }
                aria-pressed={channels.includes(ch)}
                onClick={() => toggle(ch)}
              >
                <i aria-hidden="true" />
                {CHANNELS[ch].name}
                <small>
                  {model?.routes.filter((r) => r.channel === ch).length ?? 0}
                </small>
              </button>
            ))}
          </div>
          <button onClick={() => view.current?.fit()}>Fit ship</button>
        </div>
        <div className="systems-design-body">
          <aside
            className="systems-equipment-list"
            aria-label="Installed equipment"
          >
            <h3>
              Installed equipment <small>{model?.components.length ?? 0}</small>
            </h3>
            <label className="systems-depth-filter">
              <input
                type="checkbox"
                checked={belowOnly}
                onChange={(e) => {
                  setBelowOnly(e.target.checked);
                  if (e.target.checked && component && !component.belowDeck)
                    setSelected(model?.components.find((c) => c.belowDeck)?.id);
                }}
              />
              Under-floor only{" "}
              <span>
                {model?.components.filter((c) => c.belowDeck).length ?? 0}
              </span>
            </label>
            <div>
              {visible.map((c) => (
                <button
                  key={c.id}
                  className="systems-equipment-row"
                  aria-pressed={selected === c.id}
                  onClick={() => setSelected(c.id)}
                >
                  <span>
                    {c.name}
                    <small>
                      {c.id.replace("mount:", "").replaceAll("-", " ")}
                    </small>
                  </span>
                  <span>
                    {c.placement.position[2].toFixed(2)}
                    <small>m elevation</small>
                  </span>
                </button>
              ))}
            </div>
            {!visible.length && (
              <p>
                No under-floor equipment. Disable the filter to inspect all
                installations.
              </p>
            )}
          </aside>
          <div className="systems-design-viewport">
            <canvas
              ref={canvas}
              tabIndex={0}
              aria-label="3D ship systems. Drag to orbit, right drag to pan, scroll to zoom."
            />
            {status && (
              <p className="systems-view-status" role="status">
                {status}
              </p>
            )}
            <div className="systems-view-caption">
              <span>
                {deck === "lifted"
                  ? "Deck lifted 4 m for inspection"
                  : "Deck hidden for inspection"}
              </span>
              <span>Drag to orbit · right drag to pan · scroll to zoom</span>
            </div>
          </div>
          <aside
            className="systems-component-inspector"
            aria-label="Component connections"
          >
            {component ? (
              <>
                <div className="systems-inspector-title">
                  <h3>{component.name}</h3>
                  <button onClick={() => view.current?.focus(component.id)}>
                    Focus
                  </button>
                </div>
                <p>
                  {component.definition.sizeClass} ·{" "}
                  {Math.round(component.definition.massKg).toLocaleString()} kg
                  · {component.belowDeck ? "Under floor" : "Above floor"}
                </p>
                <dl className="systems-position">
                  <div>
                    <dt>Elevation</dt>
                    <dd>{component.placement.position[2].toFixed(2)} m</dd>
                  </div>
                  <div>
                    <dt>Ports</dt>
                    <dd>{component.ports.length}</dd>
                  </div>
                  <div>
                    <dt>Connected routes</dt>
                    <dd>{connected.length}</dd>
                  </div>
                </dl>
                <h4>Service ports</h4>
                <ul className="systems-ports">
                  {component.ports.map((p) => (
                    <li key={p.key}>
                      <span
                        style={{
                          color: CHANNELS[p.channel as DesignChannel].color,
                        }}
                      >
                        {CHANNELS[p.channel as DesignChannel].name}
                      </span>
                      <strong>
                        {p.direction === "in"
                          ? "Input"
                          : p.direction === "out"
                            ? "Output"
                            : "Bidirectional"}
                      </strong>
                      <small>
                        {p.id} · rated {p.capacity.toLocaleString()}{" "}
                        {SHIP_COMPONENT_CHANNEL_UNITS[p.channel]}
                      </small>
                    </li>
                  ))}
                </ul>
                <h4>Routing connections</h4>
                <ul className="systems-connections">
                  {connected.map((r) => (
                    <li key={r.id}>
                      <span style={{ color: CHANNELS[r.channel].color }}>
                        {CHANNELS[r.channel].name}
                      </span>
                      <p>
                        {nameOf(r.from)} <b aria-label="feeds">→</b>{" "}
                        {nameOf(r.to)}
                      </p>
                    </li>
                  ))}
                </ul>
                {!connected.length && (
                  <p>No compatible routed services for this component.</p>
                )}
              </>
            ) : (
              <p>Select equipment to inspect its ports and connections.</p>
            )}
          </aside>
        </div>
        <footer className="systems-design-footer">
          <p>
            <strong>Routing preview</strong> The ship currently uses shared
            service networks. These{" "}
            {model?.routing === "saved-proposal" ? "saved" : "generated"} routes
            show proposed pipe and cable paths.
          </p>
          {model?.unconnected.length ? (
            <p>
              {model.unconnected.length} input ports have no compatible source.
            </p>
          ) : null}
          {model?.unsupportedChannels.length ? (
            <p>
              Other service channels are not shown:{" "}
              {model.unsupportedChannels.join(", ")}.
            </p>
          ) : null}
          {error && <p role="alert">{error}</p>}
        </footer>
      </section>
    </div>
  );
}
