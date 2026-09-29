/** Browser intent adapter. Energy, reload and firing permission remain server-owned. */
export type CombatInputState = {
  active: boolean;
  allowed: boolean;
  blocked: boolean;
  weapon?: {
    itemId: string;
    revision: bigint;
    energy: number;
    shotCost: number;
    cooldownMs: number;
    /** The weapon accepts a manual reload (a cell or magazine swap). */
    canReload?: boolean;
    /** An accepted reload is still running: the server refuses fire until it completes. */
    reloading?: boolean;
    /** Capacity, so a full weapon is not asked to reload. */
    capacity?: number;
  };
};
export function createCombatInput(options: {
  state: () => CombatInputState;
  aim: () => number | undefined;
  sendAim: (active: boolean, angle: number) => Promise<unknown>;
  fire: (itemId: string, revision: bigint) => Promise<unknown>;
  /** Request a reload (R, or pulling the trigger on an empty weapon). */
  reload?: (itemId: string, revision: bigint) => Promise<unknown>;
  error: (error: unknown) => void;
  now?: () => number;
}) {
  let held = false,
    busy = false,
    disposed = false,
    previouslyActive = false,
    lastFire = -Infinity,
    lastReload = -Infinity;
  let pendingPress: string | undefined;
  const now = options.now ?? (() => performance.now());
  const active = () => {
    const s = options.state();
    return s.active && s.allowed && !s.blocked && !disposed;
  };
  /** One reload request per weapon revision and second; the server refuses anything else. */
  async function reload() {
    const weapon = options.state().weapon;
    if (
      !options.reload ||
      !weapon?.canReload ||
      weapon.reloading ||
      !active() ||
      (weapon.capacity !== undefined && weapon.energy >= weapon.capacity) ||
      now() - lastReload < 1000
    )
      return false;
    lastReload = now();
    await options.reload(weapon.itemId, weapon.revision);
    return true;
  }
  async function tick() {
    if (busy || disposed) return;
    busy = true;
    try {
      const angle = options.aim();
      const aiming = active() && angle !== undefined && Number.isFinite(angle);
      if (aiming || previouslyActive) await options.sendAim(aiming, angle ?? 0);
      previouslyActive = aiming;
      // Recheck after awaiting the heartbeat: a menu/disconnect can intervene.
      const weapon = options.state().weapon;
      const pressed = !!weapon && pendingPress === weapon.itemId;
      pendingPress = undefined;
      if (
        aiming &&
        active() &&
        (held || pressed) &&
        weapon &&
        !weapon.reloading
      ) {
        if (weapon.energy < weapon.shotCost) {
          // Pulling the trigger on an empty weapon reloads it where the weapon allows.
          await reload();
        } else if (now() - lastFire >= weapon.cooldownMs) {
          await options.fire(weapon.itemId, weapon.revision);
          lastFire = now();
        }
      }
    } catch (error) {
      pendingPress = undefined;
      if (!disposed) options.error(error);
    } finally {
      busy = false;
    }
  }
  return {
    tick,
    trigger(pressed: boolean) {
      held = pressed;
      if (pressed) {
        pendingPress = active() ? options.state().weapon?.itemId : undefined;
        void tick();
      }
    },
    /** Manual reload intent (R). */
    reload() {
      return reload().catch((error) => {
        if (!disposed) options.error(error);
        return false;
      });
    },
    cancel() {
      held = false;
      pendingPress = undefined;
    },
    dispose() {
      disposed = true;
      held = false;
      pendingPress = undefined;
    },
  };
}
