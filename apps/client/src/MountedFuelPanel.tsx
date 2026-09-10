import { useState, useRef } from "react";
import type { DbConnection } from "@sidereal/net";
import { createOperationId } from "./operation-id";
import "./ship-refit.css";

/** Only already-visible reservoirs are offered. The reducer rechecks reach,
 * custody, capacity, mass and every source/destination revision. */
export function MountedFuelPanel({
  connection,
  selectedObject,
  onError,
}: {
  connection: DbConnection | null;
  selectedObject: string | undefined;
  onError: (message: string) => void;
}) {
  const [canisterId, setCanisterId] = useState(""),
    [litres, setLitres] = useState("1"),
    [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const attachment =
    connection &&
    [...connection.db.ownWayfarerRefitAttachments.iter()].find(
      (a) => a.id === selectedObject,
    );
  if (!connection || !attachment) return null;
  const tank = [...connection.db.ownReachableCargoContainers.iter()].find(
    (c) => c.id === attachment.containerId,
  );
  const canisters = [...connection.db.ownInventoryContainers.iter()].filter(
    (c) =>
      c.kind === "liquid" &&
      !!c.parentItemId &&
      (c.amountLitres === 0 || c.liquidType === "fuel"),
  );
  const selected = canisters.find((c) => c.id === canisterId) ?? canisters[0];
  const amount = Number(litres);
  async function transfer(toTank: boolean) {
    if (!connection || !attachment || !selected || sending.current) return;
    const liveTank = [...connection.db.ownReachableCargoContainers.iter()].find(
      (c) => c.id === attachment.containerId,
    );
    const liveCanister = [
      ...connection.db.ownCarriedInventoryRevisions.iter(),
    ].find((r) => r.kind === "container" && r.id === selected.id);
    const state = [...connection.db.ownInventoryState.iter()][0];
    if (!liveTank || !liveCanister || !state) {
      onError(
        "Fuel access changed. Approach the tank with a carried canister.",
      );
      return;
    }
    const source = toTank ? liveCanister : liveTank,
      destination = toTank ? liveTank : liveCanister;
    sending.current = true;
    setBusy(true);
    try {
      await connection.reducers.transferWayfarerLiquid({
        sourceId: source.id,
        destinationId: destination.id,
        expectedSourceRevision: source.revision,
        expectedDestinationRevision: destination.revision,
        expectedInventoryRevision: state.revision,
        litres: amount,
        operationId: createOperationId(),
      });
    } catch (error) {
      onError(String(error));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="ship-service-panel fuel-service-panel"
      aria-label="Mounted fuel tank"
    >
      <h2>Fuel tank</h2>
      {!tank ? (
        <p>Approach the tank on clear floor to transfer fuel.</p>
      ) : (
        <>
          <p>
            {tank.amountLitres.toFixed(1)} / {tank.capacityLitres.toFixed(1)} L
            · Fuel
          </p>
          {!selected ? (
            <p>Carry a compatible liquid canister to transfer fuel.</p>
          ) : (
            <>
              <label>
                Carried canister
                <select
                  value={selected.id}
                  onChange={(e) => setCanisterId(e.target.value)}
                >
                  {canisters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.amountLitres.toFixed(1)} /{" "}
                      {c.capacityLitres.toFixed(1)} L
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Litres
                <input
                  type="number"
                  min="0.1"
                  max="100"
                  step="0.1"
                  value={litres}
                  onChange={(e) => setLitres(e.target.value)}
                />
              </label>
              <button
                disabled={
                  busy ||
                  !Number.isFinite(amount) ||
                  amount <= 0 ||
                  amount > 100 ||
                  selected.amountLitres < amount ||
                  tank.amountLitres + amount > tank.capacityLitres
                }
                onClick={() => void transfer(true)}
              >
                Pour into tank
              </button>
              <button
                disabled={
                  busy ||
                  !Number.isFinite(amount) ||
                  amount <= 0 ||
                  amount > 100 ||
                  tank.amountLitres < amount ||
                  selected.amountLitres + amount > selected.capacityLitres
                }
                onClick={() => void transfer(false)}
              >
                Fill canister
              </button>
            </>
          )}
        </>
      )}
      <small>Manual transfer · no fuel line connected.</small>
    </section>
  );
}
