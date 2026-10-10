import { tables, type DbConnection } from "@sidereal/net";
import { LAB_FLIGHT_ACTUATORS } from "@sidereal/content/flight";
import {
  createShipSystemsWindow,
  type ShipSystemsState,
} from "@sidereal/canvas-ui/ship-systems";
import { createOperationId } from "./operation-id";
import {
  budgetLines,
  budgetOfReport,
  budgetStatus,
  estimateShipSystems,
} from "./ship-systems-budget";
import { systemsDesignSource } from "./systems-design-source";
import { openSystemsDesign } from "./systems-design";
function engineName(sourceId: string) {
  const d = LAB_FLIGHT_ACTUATORS.find((d) => d.id === sourceId);
  if (!d) return "Engine";
  const side = d.x < 0 ? "Port" : d.x > 0 ? "Starboard" : "Centre";
  return `${side} ${sourceId.startsWith("drives-main") ? "main drive" : sourceId.startsWith("drives-retro") ? "retro drive" : `${d.y < 0 ? "aft" : "forward"} maneuver drive`}`;
}
/** SDK state/commands only. All service and inspection chrome is drawn by CanvasUI. */
export function openShipSystemsService(
  connection: DbConnection,
  callbacks: {
    close: () => void;
    invalidate: () => void;
    error: (message: string) => void;
    canvas: () => HTMLCanvasElement | null;
  },
) {
  let disposed = false,
    ready = false,
    pending = "",
    error = "";
  let inspection: ReturnType<typeof openSystemsDesign> | undefined;
  let inspectionJson: string | undefined;
  let inspectionShip: string | undefined;
  let state: ShipSystemsState = {
    ready,
    name: "Ship systems",
    status: "",
    error,
    pending,
    budget: [],
    issues: [],
    engines: [],
    canInspect: false,
  };
  function context() {
    const actor = [...connection.db.ownCharacters.iter()][0];
    const owned = [...connection.db.ownShips.iter()].some(
      (row) => row.id === actor?.shipId,
    );
    const binding = [...connection.db.ownAuthoredFlights.iter()].find(
      (row) => row.shipId === actor?.shipId,
    );
    const instance = owned
      ? [...connection.db.ownConstructionInstances.iter()].find(
          (row) => row.id === actor?.shipId,
        )
      : undefined;
    return { actor, owned, binding, instance };
  }
  function closeInspection() {
    inspection?.dispose();
    inspection = undefined;
    inspectionJson = undefined;
    inspectionShip = undefined;
  }
  function refresh() {
    if (disposed) return;
    const { actor, owned, binding, instance } = context();
    if (
      inspection &&
      (!owned ||
        instance?.id !== inspectionShip ||
        instance?.documentJson !== inspectionJson)
    )
      closeInspection();
    const network = [...connection.db.ownShipNetworks.iter()].find(
      (r) => r.shipId === actor?.shipId,
    );
    const report = [...connection.db.ownShipSystemsReport.iter()].find(
      (r) => r.shipId === actor?.shipId,
    );
    const estimate =
      !network && owned
        ? estimateShipSystems(
            instance?.documentJson,
            [...connection.db.ownShipComponentDamage.iter()]
              .filter((r) => r.shipId === actor?.shipId)
              .map((r) => ({
                objectId: r.objectId,
                performance: r.performance,
              })),
          )
        : undefined;
    const budget =
      network ??
      (estimate &&
        budgetOfReport(estimate.report, estimate.damaged, estimate.destroyed));
    let issues: string[] = [];
    try {
      const parsed = report?.reportJson
        ? JSON.parse(report.reportJson)
        : estimate?.report;
      issues =
        parsed?.issues
          ?.filter((i: { severity: string }) => i.severity !== "info")
          .slice(0, 5)
          .map((i: { message: string }) => i.message) ?? [];
    } catch {
      /* A missing compile is disclosed by the status line. */
    }
    state = {
      ready,
      name:
        systemsDesignSource(instance?.documentJson)?.doc.name ?? "Current ship",
      status: budget
        ? budgetStatus(budget)
        : "No compatible power installation",
      error,
      pending,
      budget: budget ? budgetLines(budget) : [],
      issues,
      canInspect: !!systemsDesignSource(instance?.documentJson),
      engines: [...connection.db.ownAuthoredFlightPowerFittings.iter()]
        .filter((r) => r.shipId === actor?.shipId && r.kind === "actuator")
        .sort((a, b) => a.sourceDeviceId.localeCompare(b.sourceDeviceId))
        .map((r) => ({
          id: r.placedObjectId,
          label: engineName(r.sourceDeviceId),
          connected: r.powered,
          enabled: owned && binding?.lifecycle === "active",
        })),
    };
    callbacks.invalidate();
  }
  async function power(id: string, connected: boolean) {
    if (disposed || pending || !ready || !connection.isActive) return;
    const { owned, binding } = context();
    const engine = [
      ...connection.db.ownAuthoredFlightPowerFittings.iter(),
    ].find(
      (r) =>
        r.shipId === binding?.shipId &&
        r.placedObjectId === id &&
        r.kind === "actuator",
    );
    if (!owned || !binding || !engine) {
      error = "Your ship access changed. Reopen ship systems.";
      refresh();
      return;
    }
    pending = id;
    error = "";
    refresh();
    try {
      await connection.reducers.setConstructionEnginePower({
        shipId: binding.shipId,
        enginePlacedObjectId: id,
        connected,
        expectedRevision: binding.revision,
        operationId: createOperationId(),
      });
    } catch (e) {
      if (!disposed) {
        error = String(e);
        callbacks.error(error);
      }
    } finally {
      pending = "";
      refresh();
    }
  }
  const display = createShipSystemsWindow(() => state, {
    close: callbacks.close,
    power: (id, connected) => void power(id, connected),
    inspect: () => {
      const { instance } = context();
      const source = systemsDesignSource(instance?.documentJson);
      if (!ready || !source || inspection) return;
      try {
        inspectionJson = instance?.documentJson;
        inspectionShip = instance?.id;
        inspection = openSystemsDesign(
          source,
          closeInspection,
          callbacks.canvas() ?? undefined,
          (message) => {
            error = message;
            refresh();
          },
        );
      } catch (e) {
        error = String(e);
        refresh();
      }
    },
  });
  const watched = [
    connection.db.ownConstructionInstances,
    connection.db.ownCharacters,
    connection.db.ownShips,
    connection.db.ownAuthoredFlights,
    connection.db.ownAuthoredFlightPowerFittings,
    connection.db.ownShipNetworks,
    connection.db.ownShipSystemsReport,
    connection.db.ownShipComponentDamage,
  ];
  for (const table of watched) {
    table.onInsert(refresh);
    table.onDelete(refresh);
    table.onUpdate(refresh);
  }
  const subscription = connection
    .subscriptionBuilder()
    .onApplied(() => {
      if (disposed) subscription.unsubscribe();
      else {
        ready = true;
        refresh();
      }
    })
    .onError(() => {
      if (!disposed) {
        error = "Ship systems are unavailable. Reconnect and try again.";
        refresh();
      }
    })
    .subscribe([
      tables.ownAuthoredFlights,
      tables.ownAuthoredFlightPowerFittings,
      tables.ownShipNetworks,
      tables.ownShipSystemsReport,
    ]);
  refresh();
  return {
    display,
    dispose() {
      if (disposed) return;
      disposed = true;
      closeInspection();
      for (const table of watched) {
        table.removeOnInsert(refresh);
        table.removeOnDelete(refresh);
        table.removeOnUpdate(refresh);
      }
      if (subscription.isActive()) subscription.unsubscribe();
    },
  };
}
