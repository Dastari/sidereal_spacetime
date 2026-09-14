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
/** Sequence/lease ownership belongs to the authenticated reducer adapter.
 * Piloting needs fresh zero-input commands too: zero demand asks IFCS to brake.
 * Acknowledgements must not serialize the 100ms heartbeat or key releases. */
export function createIntentTransmitter<T extends object>(options: {
  now: () => number;
  send: (connection: T, intent: MovementIntent) => Promise<unknown>;
  onError: (error: unknown) => void;
  onStalled: (connection: T) => void;
}) {
  type Attempt = { intent: MovementIntent; at: number };
  let previous: Attempt | undefined;
  let pending = new Set<Attempt>();
  let currentConnection: T | undefined;
  let failedUntil = 0;
  let stalled = false;
  let disposed = false;
  return {
    offer(connection: T, intent: MovementIntent, piloting = false) {
      if (disposed) return false;
      const now = options.now();
      if (currentConnection !== connection) {
        currentConnection = connection;
        previous = undefined;
        pending = new Set();
        failedUntil = 0;
        stalled = false;
      }
      if (stalled || now < failedUntil) return false;
      const heartbeat = piloting || moving(intent) ? 100 : 1000;
      if (
        previous &&
        same(previous.intent, intent) &&
        now - previous.at < heartbeat
      )
        return false;
      // Bound SDK requests if the socket stops acknowledging. Reconnect instead
      // of dropping the queue and accumulating another batch on the same socket.
      if (pending.size >= 32) {
        stalled = true;
        options.onStalled(connection);
        return false;
      }
      const attempt = { intent: { ...intent }, at: now };
      const batch = pending;
      batch.add(attempt);
      previous = attempt;
      Promise.resolve()
        .then(() => {
          if (disposed || pending !== batch) return;
          return options.send(connection, attempt.intent);
        })
        .then(
          () => {
            batch.delete(attempt);
          },
          (error) => {
            batch.delete(attempt);
            if (disposed || pending !== batch || previous !== attempt) return;
            previous = undefined;
            failedUntil = options.now() + 1000;
            options.onError(error);
          },
        );
      return true;
    },
    dispose() {
      disposed = true;
      pending.clear();
    },
  };
}
