export type MovementIntent = {
  throttle: number;
  turn: number;
  dx: number;
  dy: number;
  sprint: boolean;
};
const same = (a: MovementIntent, b: MovementIntent) =>
  a.throttle === b.throttle &&
  a.turn === b.turn &&
  a.dx === b.dx &&
  a.dy === b.dy &&
  a.sprint === b.sprint;
const moving = (a: MovementIntent) =>
  a.throttle !== 0 || a.turn !== 0 || a.dx !== 0 || a.dy !== 0;
/** Coalesce unchanged controls, not authority. Sequence/lease ownership belongs
 * to the authenticated reducer adapter. Active intent expires after 300ms on
 * the server, so retain 100ms moving heartbeats; idle needs only 1s keepalive. */
export function createIntentTransmitter<T extends object>(options: {
  now: () => number;
  send: (connection: T, intent: MovementIntent) => Promise<unknown>;
  onError: (error: unknown) => void;
}) {
  let previous:
    { connection: T; intent: MovementIntent; at: number } | undefined;
  let pending: { connection: T; intent: MovementIntent } | undefined;
  let currentConnection: T | undefined;
  let failedUntil = 0;
  let disposed = false;
  return {
    offer(connection: T, intent: MovementIntent) {
      if (disposed || pending) return false;
      const now = options.now();
      if (currentConnection !== connection) {
        currentConnection = connection;
        previous = undefined;
        failedUntil = 0;
      }
      if (now < failedUntil) return false;
      const heartbeat = moving(intent) ? 100 : 1000;
      if (
        previous &&
        same(previous.intent, intent) &&
        now - previous.at < heartbeat
      )
        return false;
      const attempt = { connection, intent: { ...intent } };
      pending = attempt;
      previous = { ...attempt, at: now };
      // Capture synchronous reducer adapter failures too.
      Promise.resolve()
        .then(() => options.send(connection, attempt.intent))
        .then(
          () => {
            if (pending === attempt) pending = undefined;
          },
          (error) => {
            if (pending !== attempt) return;
            pending = undefined;
            previous = undefined;
            failedUntil = options.now() + 1000;
            if (!disposed) options.onError(error);
          },
        );
      return true;
    },
    dispose() {
      disposed = true;
      pending = undefined;
    },
  };
}
