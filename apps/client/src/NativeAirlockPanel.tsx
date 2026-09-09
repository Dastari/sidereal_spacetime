import type { DbConnection } from "@sidereal/net";
import { createOperationId } from "./operation-id";

type Airlock = IterableElement<
  ReturnType<DbConnection["db"]["ownNativeAirlocks"]["iter"]>
>;
type Door = IterableElement<
  ReturnType<DbConnection["db"]["ownConstructionDoors"]["iter"]>
>;
type IterableElement<T> = T extends Iterable<infer Row> ? Row : never;

/** Manual work emits a fresh validated command; accepted hinge/gasket state is
 * rendered separately. A stopped partial operation may resume the same target. */
export function NativeAirlockPanel({
  connection,
  airlock,
  doors,
  visitId,
  onError,
}: {
  connection: DbConnection;
  airlock: Airlock;
  doors: readonly Door[];
  visitId: string;
  onError: (message: string) => void;
}) {
  const command = (door: Door, open: boolean) => {
    void connection.reducers
      .setConstructionDoor({
        openingId: door.id,
        expectedVisitId: visitId,
        expectedRevision: door.revision,
        open,
        operationId: createOperationId(),
      })
      .catch((error) => onError(String(error)));
  };
  return (
    <section aria-label="Airlock manual service">
      <strong>Airlock · manual service</strong>
      <small>
        Stand beside a door to operate it. Partial travel can be resumed.
      </small>
      <div>
        Interior {(airlock.interiorPressurePa / 1000).toFixed(2)} kPa · Chamber{" "}
        {(airlock.chamberPressurePa / 1000).toFixed(2)} kPa
      </div>
      <small>No powered pump connected.</small>
      {(["inner", "outer"] as const).map((side) => {
        const inner = side === "inner",
          id = inner ? airlock.innerDoorId : airlock.outerDoorId;
        const door = doors.find((d) => d.id === id);
        if (!door) return null;
        const fraction = inner ? airlock.innerFraction : airlock.outerFraction;
        const seal = inner
          ? airlock.innerSealRetraction
          : airlock.outerSealRetraction;
        const canService = inner
          ? airlock.innerCanService
          : airlock.outerCanService;
        return (
          <section key={id} aria-label={`${side} airlock door`}>
            <strong>
              {inner ? "Inner" : "Outer"} door · {Math.round(fraction * 100)}%
              open
            </strong>
            <small>
              {fraction === 0 && seal === 0
                ? "Seal seated"
                : seal === 1
                  ? "Seal retracted"
                  : "Seal moving"}
              {door.blocked ? " · Obstructed" : ""}
              {!canService ? " · Approach door" : ""}
            </small>
            <button
              disabled={
                !canService ||
                airlock.manualServiceActive ||
                (fraction === 1 && seal === 1)
              }
              onClick={() => command(door, true)}
            >
              {door.targetOpen && fraction > 0 && fraction < 1
                ? "Resume opening"
                : "Open"}{" "}
              {side} door
            </button>
            <button
              disabled={
                !canService ||
                airlock.manualServiceActive ||
                (fraction === 0 && seal === 0)
              }
              onClick={() => command(door, false)}
            >
              {!door.targetOpen && (fraction > 0 || seal > 0)
                ? "Resume closing"
                : "Close"}{" "}
              {side} door
            </button>
          </section>
        );
      })}
    </section>
  );
}
