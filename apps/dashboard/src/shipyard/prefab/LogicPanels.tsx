/**
 * Ship logic editing (wiki `Systems/Ship Logic`): the Button tool's left panel (add door actuators
 * and airlock controllers, list devices) and the Inspector for a selected logic device (placement,
 * cycle time, its wires and a simple "add wire" row). Every change goes through `commands.ts`.
 */
import { FACE_NORMALS } from "@sidereal/content/construction-grammar";
import {
  SHIP_LOGIC_DEVICES,
  SHIP_LOGIC_LIMITS,
  shipLogicPort,
  type LogicFacing,
  type PrefabLogicDevice,
  type ShipLogicPortSpec,
} from "@sidereal/content/ship-logic";
import {
  logicWallPlacement,
  type PrefabComponentCatalog,
  type PrefabIssue,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  addAirlockController,
  addLogicDoor,
  addLogicWire,
  deviceWires,
  logicDoors,
  moveLogicButton,
  removeLogicWire,
  removeSelection,
  renameElement,
  setControllerCycle,
  type CommandResult,
  type PrefabSelection,
} from "./commands";
import { NumberField, SelectField, TextField } from "./fields";

type Doc = ShipPrefabDocumentV1;

const portLabel = (d: PrefabLogicDevice, port: string) =>
  shipLogicPort(d.kind, port)?.label ?? port;

// ------------------------------------------------------------------ Button tool panel
export function LogicToolPanel({
  doc,
  catalog,
  apply,
  select,
  selection,
}: {
  doc: Doc;
  catalog: PrefabComponentCatalog;
  apply: (label: string, r: CommandResult) => void;
  select: (s: PrefabSelection | null) => void;
  selection: PrefabSelection | null;
}) {
  const doors = useMemo(
    () => logicDoors(doc, catalog).filter((d) => d.type !== "door.forcefield"),
    [doc, catalog],
  );
  const devices = doc.logic?.devices ?? [];
  const free = doors.filter(
    (d) => !devices.some((x) => x.kind === "door" && x.door === d.id),
  );
  const [door, setDoor] = useState("");
  const [cycle, setCycle] = useState<number>(SHIP_LOGIC_LIMITS.cycleDefaultS);
  const pick = free.some((d) => d.id === door) ? door : (free[0]?.id ?? "");
  return (
    <>
      <section className="layout-section">
        <h2>Wall button</h2>
        <p className="layout-note">
          {SHIP_LOGIC_DEVICES.button.description} Buttons sit on a wall line on
          the 0.25 m grid: inside the hull shell, on a room wall, or on the
          outer hull (pressed from space). Never on a door or open floor.
        </p>
      </section>
      <section className="layout-section">
        <h2>Door actuators</h2>
        {free.length ? (
          <>
            <SelectField<string>
              label="Door"
              value={pick}
              options={free.map((d) => ({
                value: d.id,
                label: `${d.id} (${d.exterior ? "exterior" : "interior"}, ${d.rooms.filter(Boolean).join(" / ") || "no room"})`,
              }))}
              onChange={setDoor}
            />
            <div className="pf-row">
              <button
                data-logic-add="door"
                onClick={() =>
                  apply(
                    `Add door actuator on ${pick}`,
                    addLogicDoor(doc, pick, catalog),
                  )
                }
              >
                <Plus size={14} /> Door actuator
              </button>
            </div>
          </>
        ) : (
          <p className="layout-note">
            {doors.length
              ? "Every door already has an actuator."
              : "Place doors (Edge tool) or exterior openings (Mount tool) first."}
          </p>
        )}
        <p className="layout-note">{SHIP_LOGIC_DEVICES.door.description}</p>
      </section>
      <section className="layout-section">
        <h2>Airlock controller</h2>
        <NumberField
          label="Cycle stage"
          unit="s"
          step={0.1}
          min={SHIP_LOGIC_LIMITS.cycleMinS}
          max={SHIP_LOGIC_LIMITS.cycleMaxS}
          value={cycle}
          onCommit={setCycle}
        />
        <div className="pf-row">
          <button
            data-logic-add="controller"
            onClick={() =>
              apply("Add airlock controller", addAirlockController(doc, cycle))
            }
          >
            <Plus size={14} /> Airlock controller
          </button>
        </div>
        <p className="layout-note">
          {SHIP_LOGIC_DEVICES["airlock-controller"].description} Wire its inner
          and outer outputs to door actuators and their states back to it.
        </p>
      </section>
      <section className="layout-section">
        <h2>Devices ({devices.length})</h2>
        {devices.length ? (
          <div className="pf-volume-list" role="listbox" aria-label="Logic">
            {devices.map((d) => (
              <button
                key={d.id}
                role="option"
                className="pf-volume-row"
                aria-selected={
                  selection?.kind === "logic" && selection.id === d.id
                }
                onClick={() => select({ kind: "logic", id: d.id })}
              >
                <i className={`pf-logic-swatch k-${d.kind}`} />
                <span>{d.id}</span>
                <small>{SHIP_LOGIC_DEVICES[d.kind].name}</small>
              </button>
            ))}
          </div>
        ) : (
          <p className="layout-note">No logic devices yet.</p>
        )}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ Inspector
function AddWire({
  doc,
  device,
  apply,
}: {
  doc: Doc;
  device: PrefabLogicDevice;
  apply: (label: string, r: CommandResult) => void;
}) {
  const ports = SHIP_LOGIC_DEVICES[device.kind].ports;
  const [portId, setPortId] = useState(ports[0].id);
  const [target, setTarget] = useState("");
  const [targetPort, setTargetPort] = useState("");
  const [error, setError] = useState("");
  const port = ports.find((p) => p.id === portId) ?? ports[0];
  const fits = (p: ShipLogicPortSpec) =>
    p.direction !== port.direction && p.signal === port.signal;
  const targets = (doc.logic?.devices ?? []).filter(
    (d) => d.id !== device.id && SHIP_LOGIC_DEVICES[d.kind].ports.some(fits),
  );
  const t = targets.find((d) => d.id === target) ?? targets[0];
  const tPorts = t ? SHIP_LOGIC_DEVICES[t.kind].ports.filter(fits) : [];
  const tp = tPorts.find((p) => p.id === targetPort) ?? tPorts[0];
  return (
    <div className="pf-logic-addwire">
      <h3>Add wire</h3>
      <SelectField<string>
        label="This device's port"
        value={port.id}
        options={ports.map((p) => ({
          value: p.id,
          label: `${p.direction === "out" ? "out" : "in"} ${p.label} (${p.signal})`,
        }))}
        onChange={(v) => {
          setPortId(v);
          setError("");
        }}
      />
      {t && tp ? (
        <>
          <SelectField<string>
            label={port.direction === "out" ? "To device" : "From device"}
            value={t.id}
            options={targets.map((d) => ({
              value: d.id,
              label: `${d.id} (${SHIP_LOGIC_DEVICES[d.kind].name})`,
            }))}
            onChange={(v) => {
              setTarget(v);
              setError("");
            }}
          />
          <SelectField<string>
            label={port.direction === "out" ? "Input" : "Output"}
            value={tp.id}
            options={tPorts.map((p) => ({ value: p.id, label: p.label }))}
            onChange={(v) => {
              setTargetPort(v);
              setError("");
            }}
          />
          <div className="pf-row">
            <button
              data-logic-wire
              onClick={() => {
                const here = { device: device.id, port: port.id };
                const there = { device: t.id, port: tp.id };
                const r =
                  port.direction === "out"
                    ? addLogicWire(doc, here, there)
                    : addLogicWire(doc, there, here);
                setError(r.error ?? "");
                if (!r.error) apply("Add wire", r);
              }}
            >
              <Plus size={14} /> Wire
            </button>
          </div>
        </>
      ) : (
        <p className="layout-note">
          No other device has a{" "}
          {port.direction === "out" ? "matching input" : "matching output"} (
          {port.signal}).
        </p>
      )}
      {error && (
        <p className="pf-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function LogicInspector({
  doc,
  catalog,
  id,
  select,
  commit,
  apply,
  issues,
}: {
  doc: Doc;
  catalog: PrefabComponentCatalog;
  id: string;
  select: (s: PrefabSelection | null) => void;
  commit: (label: string, doc: Doc) => void;
  apply: (label: string, r: CommandResult) => void;
  issues: PrefabIssue[];
}) {
  const d = doc.logic?.devices.find((x) => x.id === id);
  if (!d) return null;
  const spec = SHIP_LOGIC_DEVICES[d.kind];
  const wires = deviceWires(doc, d.id);
  const wireIds = new Set(wires.map((w) => w.id));
  const own = issues.filter(
    (i) =>
      i.ref.kind === "logic" && (i.ref.id === d.id || wireIds.has(i.ref.id)),
  );
  const devices = new Map((doc.logic?.devices ?? []).map((x) => [x.id, x]));
  const place =
    d.kind === "button" ? logicWallPlacement(doc, d, catalog) : null;
  const door =
    d.kind === "door"
      ? logicDoors(doc, catalog).find((x) => x.id === d.door)
      : undefined;
  return (
    <section className="layout-section pf-logic-inspector">
      <h2>
        {spec.name} {d.id}
      </h2>
      <p className="layout-id">
        {d.kind} · {spec.placement} device · {spec.connectorFamily}
      </p>
      <TextField
        label="Id"
        value={d.id}
        filter={(v) => v.toLowerCase().replace(/[^a-z0-9._-]/g, "")}
        maxLength={80}
        onCommit={(next) =>
          next &&
          apply(
            "Rename logic device",
            renameElement(doc, { kind: "logic", id: d.id }, next),
          )
        }
      />
      {d.kind === "button" && d.at && d.normal && (
        <>
          <dl>
            <dt>Placement</dt>
            <dd>
              {place && !("error" in place)
                ? `${place.side} ${place.wall} wall${place.room ? `, faces ${place.room}` : ", faces space"}`
                : `not usable: ${place?.error}`}
            </dd>
          </dl>
          <div className="pf-grid2">
            <NumberField
              label="X"
              unit="m"
              step={0.25}
              value={d.at[0]}
              onCommit={(x) =>
                apply(
                  "Move button",
                  moveLogicButton(doc, d.id, [x, d.at![1]], d.normal, catalog),
                )
              }
            />
            <NumberField
              label="Y"
              unit="m"
              step={0.25}
              value={d.at[1]}
              onCommit={(y) =>
                apply(
                  "Move button",
                  moveLogicButton(doc, d.id, [d.at![0], y], d.normal, catalog),
                )
              }
            />
          </div>
          <SelectField<LogicFacing>
            label="Faces"
            value={d.normal}
            options={FACE_NORMALS}
            onChange={(normal) =>
              apply(
                "Turn button",
                moveLogicButton(doc, d.id, d.at!, normal, catalog),
              )
            }
          />
        </>
      )}
      {d.kind === "door" && (
        <dl>
          <dt>Door</dt>
          <dd>{d.door}</dd>
          <dt>Type</dt>
          <dd>{door ? door.type : "missing"}</dd>
          <dt>Opens</dt>
          <dd>
            {door
              ? `${door.exterior ? "exterior" : "interior"}: ${door.rooms.map((r) => r ?? "space").join(" / ")}`
              : "-"}
          </dd>
        </dl>
      )}
      {d.kind === "airlock-controller" && (
        <>
          <dl>
            <dt>Placement</dt>
            <dd>virtual, on the ship data network</dd>
          </dl>
          <NumberField
            label="Cycle stage"
            unit="s"
            step={0.1}
            min={SHIP_LOGIC_LIMITS.cycleMinS}
            max={SHIP_LOGIC_LIMITS.cycleMaxS}
            value={d.cycleS ?? SHIP_LOGIC_LIMITS.cycleDefaultS}
            onCommit={(s) =>
              apply(
                "Change cycle time",
                setControllerCycle(
                  doc,
                  d.id,
                  d.cycleS === undefined &&
                    s === SHIP_LOGIC_LIMITS.cycleDefaultS
                    ? undefined
                    : s,
                ),
              )
            }
          />
        </>
      )}
      <h3>Wires ({wires.length})</h3>
      {wires.length ? (
        <ul className="pf-logic-wires">
          {wires.map((w) => {
            const out = w.from.device === d.id;
            const other = devices.get(out ? w.to.device : w.from.device);
            return (
              <li key={w.id} title={w.id}>
                <span>
                  {out ? (
                    <>
                      {portLabel(d, w.from.port)} →{" "}
                      <button
                        className="pf-link"
                        onClick={() =>
                          select({ kind: "logic", id: w.to.device })
                        }
                      >
                        {w.to.device}
                      </button>{" "}
                      {other ? portLabel(other, w.to.port) : w.to.port}
                    </>
                  ) : (
                    <>
                      <button
                        className="pf-link"
                        onClick={() =>
                          select({ kind: "logic", id: w.from.device })
                        }
                      >
                        {w.from.device}
                      </button>{" "}
                      {other ? portLabel(other, w.from.port) : w.from.port} →{" "}
                      {portLabel(d, w.to.port)}
                    </>
                  )}
                </span>
                <button
                  className="pf-danger"
                  aria-label={`Delete wire ${w.id}`}
                  title="Delete wire"
                  onClick={() =>
                    commit("Delete wire", removeLogicWire(doc, w.id))
                  }
                >
                  <Trash2 size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="layout-note">Not wired.</p>
      )}
      <AddWire key={d.id} doc={doc} device={d} apply={apply} />
      <button
        className="pf-danger"
        onClick={() => {
          commit(
            `Delete ${spec.name.toLowerCase()}`,
            removeSelection(doc, { kind: "logic", id: d.id }),
          );
          select(null);
        }}
      >
        <Trash2 size={14} /> Delete <kbd>Del</kbd>
      </button>
      {own.length ? (
        <ul className="layout-validation">
          {own.map((i, n) => (
            <li key={n} data-severity={i.severity}>
              <button tabIndex={-1}>
                <strong>{i.code.replace(/[.-]/g, " ")}</strong>
                <span>{i.message}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pf-ok">No issues on this device.</p>
      )}
    </section>
  );
}
