/**
 * Presentation-only motion for another character's body: accepted server positions arrive at the
 * world tick (20 Hz) and are replayed a little behind real time, so the body glides between them
 * instead of stepping. Nothing here feeds back into simulation.
 */

/** Replay delay behind the newest accepted position: about one and a half world ticks. */
export const REMOTE_CREW_DELAY_MS = 75;
/** A jump longer than this between accepted positions is a relocation (respawn), not a walk. */
export const REMOTE_CREW_SNAP_M = 2;
/** Displayed speed above which the body walks (m/s); below it, it stands. */
export const REMOTE_CREW_MOVING_MPS = 0.35;

type Sample = { t: number; x: number; y: number; z: number };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface RemoteCrewPoseInput {
  seated: boolean;
  dead: boolean;
  aimActive: boolean;
  aimAngle: number;
  /** Facing while seated (renderer yaw, like the local character's seatFacing). */
  seatFacing: number;
}

export interface RemoteCrewDisplayed {
  x: number;
  y: number;
  /** Standing elevation (m) of the deck surface under the body. */
  z: number;
  /** Displayed ground speed (m/s). */
  speed: number;
  moving: boolean;
  /** Renderer yaw (`root.rotation.y`). */
  yaw: number;
}

/**
 * Buffered interpolation of accepted positions plus the body's facing: aim direction while aiming,
 * the seat's facing while seated, travel direction while walking, otherwise the last facing.
 */
export function createRemoteCrewMotion(delayMs = REMOTE_CREW_DELAY_MS) {
  const samples: Sample[] = [];
  let yaw: number | undefined;
  let last: RemoteCrewDisplayed | undefined;
  let lastNow: number | undefined;
  return {
    /** Record an accepted position (ship-local metres) received at `t` (ms). */
    push(t: number, x: number, y: number, z: number) {
      const newest = samples.at(-1);
      // Unchanged positions carry no timing: the server sends a row only when it changes.
      if (newest && newest.x === x && newest.y === y && newest.z === z) return;
      if (newest && Math.hypot(x - newest.x, y - newest.y) > REMOTE_CREW_SNAP_M)
        samples.length = 0;
      else if (newest && t - newest.t > 250)
        // Setting off after standing: start the glide one tick before this position.
        samples.push({ ...newest, t: t - 50 });
      samples.push({ t, x, y, z });
      while (samples.length > 8) samples.shift();
    },
    /** Displayed pose at render time `now` (ms). */
    sample(now: number, pose: RemoteCrewPoseInput): RemoteCrewDisplayed {
      const target = now - delayMs;
      let x = 0,
        y = 0,
        z = 0,
        vx = 0,
        vy = 0;
      if (samples.length) {
        let i = samples.length - 1;
        while (i > 0 && samples[i - 1].t >= target) i--;
        const b = samples[i],
          a = samples[Math.max(0, i - 1)];
        if (a === b || target >= b.t) {
          ({ x, y, z } = b);
        } else if (target <= a.t) {
          ({ x, y, z } = a);
        } else {
          const k = clamp01((target - a.t) / (b.t - a.t));
          x = a.x + (b.x - a.x) * k;
          y = a.y + (b.y - a.y) * k;
          z = a.z + (b.z - a.z) * k;
        }
        if (a !== b && b.t > a.t && target < b.t + 120) {
          vx = ((b.x - a.x) / (b.t - a.t)) * 1000;
          vy = ((b.y - a.y) / (b.t - a.t)) * 1000;
        }
      }
      const speed = Math.hypot(vx, vy);
      const moving =
        !pose.seated && !pose.dead && speed > REMOTE_CREW_MOVING_MPS;
      // Same conventions as the local character: travel heading atan2(dx, dy), yaw = -heading.
      let wanted = yaw;
      if (pose.seated) wanted = pose.seatFacing;
      else if (pose.dead) wanted = yaw;
      else if (pose.aimActive) wanted = -pose.aimAngle;
      else if (moving) wanted = -Math.atan2(vx, vy);
      if (wanted === undefined) wanted = 0;
      const dt = lastNow === undefined ? 0 : Math.max(0, now - lastNow) / 1000;
      lastNow = now;
      if (yaw === undefined || pose.seated || pose.aimActive) yaw = wanted;
      else yaw = wrap(yaw + wrap(wanted - yaw) * (1 - Math.exp(-dt * 14)));
      last = { x, y, z, speed, moving, yaw };
      return last;
    },
    /** True once any accepted position has arrived. */
    get ready() {
      return samples.length > 0;
    },
    get last() {
      return last;
    },
  };
}
