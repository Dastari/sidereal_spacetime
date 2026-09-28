/**
 * Anatomical joint-limit validation for crew_rig animation GLBs (CHAR-BODY r005 body clips and
 * CHAR-WEAPONS armed clips). Pure data: parses the GLB, samples every authored frame (24 fps) of
 * every clip, evaluates forward kinematics and checks each joint against anatomical ranges.
 *
 * Joint angles are measured on the child bone relative to its rest pose, in its own rest frame
 * (glTF bone nodes keep Blender's axes: +Y along the bone; the rig's deterministic roll puts +Z
 * forward on vertical bones). The bone direction d = q_rel * (0,1,0) gives:
 *   flex  = atan2(sign * d.z, d.y)   (sign per joint so + is anatomical flexion)
 *   side  = asin(d.x), mirrored on .L so + is always away from the midline
 *   twist = swing-twist angle about +Y, mirrored on .L
 * Presentation data only: nothing here reads or writes authority.
 */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // x, y, z, w (glTF order)
type Mat4 = Float64Array;

export type JointRange = {
  /** + = anatomical flexion (knee/elbow/hip/spine forward bend, ankle/toe dorsiflexion). */
  flex: [number, number];
  side: [number, number];
  twist: [number, number];
  /** sign applied to d.z so + flex is anatomical flexion */
  flexSign: 1 | -1;
};

/** Degrees. Hinges (knee, elbow) allow only a few degrees past straight. */
export const CREW_JOINT_LIMITS: Readonly<Record<string, JointRange>> = {
  // spine chain (upright bones: +Y up, +Z forward, + flex = bend forward)
  spine: { flex: [-35, 50], side: [-35, 35], twist: [-40, 40], flexSign: 1 },
  chest: { flex: [-35, 50], side: [-35, 35], twist: [-40, 40], flexSign: 1 },
  neck: { flex: [-45, 55], side: [-40, 40], twist: [-60, 60], flexSign: 1 },
  head: { flex: [-50, 50], side: [-40, 40], twist: [-70, 70], flexSign: 1 },
  // clavicle: small elevation / protraction
  shoulder: { flex: [-35, 35], side: [-40, 40], twist: [-35, 35], flexSign: 1 },
  // shoulder ball joint (hanging arm: +Z forward, + flex = raise forward). Backward extension and
  // cross-body adduction are limited only while the arm is below shoulder height (overhead reach
  // wraps the flex angle); the elbow limits carry the arm's twist.
  upper_arm: { flex: [-90, 185], side: [-75, 185], twist: [-180, 180], flexSign: 1 },
  // elbow hinge: forearm folds toward the front of the upper arm
  forearm: { flex: [-4, 155], side: [-15, 15], twist: [-25, 25], flexSign: 1 },
  // wrist: not range-limited. The CHARACTER_SPEC grip socket keeps the barrel along socket +X,
  // perpendicular to the hand bone, so every held pose carries a ~90-150 deg wrist offset by
  // contract (a socket re-convention is CHAR-WEAPONS scope). Wrists still fail on flips.
  hand: { flex: [-180, 180], side: [-90, 90], twist: [-180, 180], flexSign: 1 },
  // hip ball joint (+ flex = thigh forward)
  thigh: { flex: [-45, 130], side: [-30, 55], twist: [-55, 55], flexSign: 1 },
  // knee hinge: shin folds backward
  shin: { flex: [-4, 150], side: [-12, 12], twist: [-20, 20], flexSign: -1 },
  // ankle (+ flex = dorsiflexion, toes up)
  foot: { flex: [-55, 60], side: [-40, 40], twist: [-45, 45], flexSign: 1 },
  toe: { flex: [-45, 65], side: [-12, 12], twist: [-12, 12], flexSign: 1 },
};

/**
 * Bone flips between frames (24 fps): a local-rotation step above CREW_MAX_STEP_DEG, or a spike
 * above CREW_SPIKE_MIN_DEG that is more than CREW_SPIKE_RATIO times both neighbouring steps (a
 * pop inside otherwise smooth motion; fast swings such as the run's knee are smooth, not spikes).
 */
export const CREW_MAX_STEP_DEG = 90;
export const CREW_SPIKE_MIN_DEG = 45;
export const CREW_SPIKE_RATIO = 3;
/**
 * Standing idles (owner feedback 2026-09-28, "goat legs"): the weight-bearing leg stays nearly
 * straight and neither knee pumps with the breathing loop.
 */
export const CREW_STANCE = {
  clips: /(^|\.)(idle|idle_armed|idle_pistol|carry_idle)$/,
  supportKneeMaxDeg: 12,
  kneeSwingMaxDeg: 8,
};
/** Sole points may not go further below the floor than this (metres, 1 fine voxel = 1/32 m). */
export const CREW_FLOOR_TOLERANCE_M = 0.5 / 32;

/** Sole sample points per foot bone, Blender armature voxels of the .R side (x mirrored for .L). */
const SOLE_POINTS: Record<string, Vec3[]> = {
  foot: [
    [1, -4, 0],
    [7, -4, 0],
    [1, 4, 0],
    [7, 4, 0],
  ],
  toe: [
    [1, 6, 0],
    [7, 6, 0],
  ],
};

export type JointViolation = {
  clip: string;
  frame: number;
  bone: string;
  kind: "flex" | "side" | "twist" | "flip" | "floor" | "stance";
  value: number;
  limit: [number, number] | number;
};

export type JointClipSummary = {
  clip: string;
  frames: number;
  /** per bone: [min, max] of flex, side, twist (degrees) */
  ranges: Record<string, { flex: [number, number]; side: [number, number]; twist: [number, number] }>;
  maxStepDeg: number;
  maxStepBone: string;
  minSoleM: number;
};

export type JointLimitReport = {
  file: string;
  clips: JointClipSummary[];
  violations: JointViolation[];
};

// ---------------------------------------------------------------- math
const DEG = 180 / Math.PI;
const qmul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qconj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];
const qnorm = (q: Quat): Quat => {
  const l = Math.hypot(...q) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};
const qrot = (q: Quat, v: Vec3): Vec3 => {
  const p = qmul(qmul(q, [v[0], v[1], v[2], 0]), qconj(q));
  return [p[0], p[1], p[2]];
};
const qangle = (a: Quat, b: Quat) => {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, d)) * DEG;
};
function slerp(a: Quat, b: Quat, t: number): Quat {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let c = b;
  if (d < 0) {
    d = -d;
    c = [-b[0], -b[1], -b[2], -b[3]];
  }
  if (d > 0.9995)
    return qnorm([0, 1, 2, 3].map((i) => a[i] + t * (c[i] - a[i])) as Quat);
  const th = Math.acos(d);
  const s0 = Math.sin((1 - t) * th) / Math.sin(th);
  const s1 = Math.sin(t * th) / Math.sin(th);
  return [0, 1, 2, 3].map((i) => s0 * a[i] + s1 * c[i]) as Quat;
}
function trs(t: Vec3, r: Quat, s: Vec3): Mat4 {
  const [x, y, z, w] = r;
  const m = new Float64Array(16); // column-major
  m[0] = (1 - 2 * (y * y + z * z)) * s[0];
  m[1] = 2 * (x * y + z * w) * s[0];
  m[2] = 2 * (x * z - y * w) * s[0];
  m[4] = 2 * (x * y - z * w) * s[1];
  m[5] = (1 - 2 * (x * x + z * z)) * s[1];
  m[6] = 2 * (y * z + x * w) * s[1];
  m[8] = 2 * (x * z + y * w) * s[2];
  m[9] = 2 * (y * z - x * w) * s[2];
  m[10] = (1 - 2 * (x * x + y * y)) * s[2];
  m[12] = t[0];
  m[13] = t[1];
  m[14] = t[2];
  m[15] = 1;
  return m;
}
function mmul(a: Mat4, b: Mat4): Mat4 {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let v = 0;
      for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = v;
    }
  return o;
}
function minvRigid(m: Mat4): Mat4 {
  // inverse of rotation (+ uniform/unit scale) + translation
  const o = new Float64Array(16);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[c * 4 + r] = m[r * 4 + c];
  for (let r = 0; r < 3; r++)
    o[12 + r] = -(o[r] * m[12] + o[4 + r] * m[13] + o[8 + r] * m[14]);
  o[15] = 1;
  return o;
}
const mpoint = (m: Mat4, v: Vec3): Vec3 => [
  m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
  m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
  m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
];

// ---------------------------------------------------------------- glTF
type GltfNode = {
  name?: string;
  children?: number[];
  translation?: Vec3;
  rotation?: Quat;
  scale?: Vec3;
};
type Gltf = {
  nodes: GltfNode[];
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }[];
  bufferViews: { byteOffset?: number }[];
  animations?: {
    name: string;
    channels: { sampler: number; target: { node: number; path: string } }[];
    samplers: { input: number; output: number; interpolation?: string }[];
  }[];
};

export function parseGlb(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB");
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(
    new TextDecoder().decode(data.subarray(20, 20 + jsonLength)),
  ) as Gltf;
  const binStart = 20 + jsonLength + 8;
  const binLength = view.getUint32(20 + jsonLength, true);
  return { json, bin: data.subarray(binStart, binStart + binLength) };
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC3: 3, VEC4: 4 };
function accessor(g: Gltf, bin: Uint8Array, index: number): number[][] {
  const a = g.accessors[index];
  if (a.componentType !== 5126) throw new Error("expected float accessor");
  const n = COMPONENTS[a.type];
  const offset = (g.bufferViews[a.bufferView].byteOffset ?? 0) + (a.byteOffset ?? 0);
  const view = new DataView(bin.buffer, bin.byteOffset + offset, a.count * n * 4);
  const out: number[][] = [];
  for (let i = 0; i < a.count; i++) {
    const row: number[] = [];
    for (let k = 0; k < n; k++) row.push(view.getFloat32((i * n + k) * 4, true));
    out.push(row);
  }
  return out;
}

type Channel = { node: number; path: string; times: number[]; values: number[][]; step: boolean };

function channels(g: Gltf, bin: Uint8Array, clip: NonNullable<Gltf["animations"]>[number]): Channel[] {
  return clip.channels.map((c) => {
    const s = clip.samplers[c.sampler];
    return {
      node: c.target.node,
      path: c.target.path,
      times: accessor(g, bin, s.input).map((r) => r[0]),
      values: accessor(g, bin, s.output),
      step: s.interpolation === "STEP",
    };
  });
}

function sampleChannel(c: Channel, t: number): number[] {
  const { times, values } = c;
  if (t <= times[0]) return values[0];
  if (t >= times[times.length - 1]) return values[values.length - 1];
  let k = 0;
  while (times[k + 1] < t) k++;
  const u = (t - times[k]) / (times[k + 1] - times[k]);
  if (c.step) return values[k];
  if (c.path === "rotation") return slerp(values[k] as Quat, values[k + 1] as Quat, u);
  return values[k].map((v, i) => v + (values[k + 1][i] - v) * u);
}

// ---------------------------------------------------------------- analysis
const baseName = (bone: string) => bone.replace(/\.[LR]$/, "");
const isLeft = (bone: string) => bone.endsWith(".L");

/** Flex / side / twist (degrees) of a local rotation relative to rest, in the rest frame. */
export function jointAngles(bone: string, rest: Quat, pose: Quat) {
  const range = CREW_JOINT_LIMITS[baseName(bone)];
  let q = qmul(qconj(rest), pose);
  if (q[3] < 0) q = [-q[0], -q[1], -q[2], -q[3]];
  const d = qrot(q, [0, 1, 0]);
  const mirror = isLeft(bone) ? -1 : 1;
  const flex = Math.atan2((range?.flexSign ?? 1) * d[2], d[1]) * DEG;
  const side = Math.asin(Math.max(-1, Math.min(1, d[0]))) * DEG * mirror;
  // swing-twist: twist = rotation about +Y left after removing the swing that maps Y onto d
  const twistQ = qnorm([0, q[1], 0, q[3]]);
  let twist = 2 * Math.atan2(twistQ[1], twistQ[3]) * DEG;
  if (twist > 180) twist -= 360;
  if (twist < -180) twist += 360;
  return { flex, side, twist: twist * mirror, below: d[1] > 0 };
}

export function validateCrewJointLimits(
  data: Uint8Array,
  file = "glb",
  options: { clips?: string[] } = {},
): JointLimitReport {
  const { json: g, bin } = parseGlb(data);
  const parent = new Map<number, number>();
  g.nodes.forEach((n, i) => n.children?.forEach((c) => parent.set(c, i)));
  const index = new Map<string, number>();
  g.nodes.forEach((n, i) => {
    if (n.name && !index.has(n.name)) index.set(n.name, i);
  });
  const bones = [...index.keys()].filter((n) => CREW_JOINT_LIMITS[baseName(n)]);
  const rest = g.nodes.map((n) => ({
    t: (n.translation ?? [0, 0, 0]) as Vec3,
    r: (n.rotation ?? [0, 0, 0, 1]) as Quat,
    s: (n.scale ?? [1, 1, 1]) as Vec3,
  }));
  const armature = index.get("root");
  if (armature === undefined) throw new Error("crew_rig root bone missing");
  // space: the armature object (parent of root); glTF Y-up, floor at y = 0
  const worldOf = (locals: typeof rest) => {
    const W = new Map<number, Mat4>();
    const get = (i: number): Mat4 => {
      const hit = W.get(i);
      if (hit) return hit;
      const own = trs(locals[i].t, locals[i].r, locals[i].s);
      const p = parent.get(i);
      const m = p === undefined || i === armatureParent ? own : mmul(get(p), own);
      W.set(i, m);
      return m;
    };
    return get;
  };
  const armatureParent = parent.get(armature);
  const restWorld = worldOf(rest);
  const soleBones = [...index.keys()].filter((n) => /^(foot|toe)\.[LR]$/.test(n));
  const restInv = new Map(
    soleBones.map((n) => [n, minvRigid(restWorld(index.get(n)!))]),
  );
  const violations: JointViolation[] = [];
  const clips: JointClipSummary[] = [];
  for (const clip of g.animations ?? []) {
    if (options.clips && !options.clips.includes(clip.name)) continue;
    const ch = channels(g, bin, clip);
    const end = Math.max(...ch.map((c) => c.times[c.times.length - 1]));
    const frames = Math.round(end * 24) + 1;
    const ranges: JointClipSummary["ranges"] = {};
    let maxStep = 0;
    let maxStepBone = "";
    let minSole = Infinity;
    let previous: Map<string, Quat> | undefined;
    let first: Map<string, Quat> | undefined;
    const steps: Record<string, number[]> = {};
    const knees: [number[], number[]] = [[], []];
    for (let f = 0; f < frames; f++) {
      const t = Math.min(end, f / 24);
      const locals = rest.map((r) => ({ ...r }));
      for (const c of ch) {
        const v = sampleChannel(c, t);
        if (c.path === "rotation") locals[c.node].r = v as Quat;
        else if (c.path === "translation") locals[c.node].t = v as Vec3;
        else if (c.path === "scale") locals[c.node].s = v as Vec3;
      }
      const current = new Map<string, Quat>();
      for (const bone of bones) {
        const i = index.get(bone)!;
        const q = locals[i].r;
        current.set(bone, q);
        const a = jointAngles(bone, rest[i].r, q);
        const lim = CREW_JOINT_LIMITS[baseName(bone)];
        const r = (ranges[bone] ??= {
          flex: [Infinity, -Infinity],
          side: [Infinity, -Infinity],
          twist: [Infinity, -Infinity],
        });
        const overhead = baseName(bone) === "upper_arm" && !a.below;
        for (const kind of ["flex", "side", "twist"] as const) {
          r[kind][0] = Math.min(r[kind][0], a[kind]);
          r[kind][1] = Math.max(r[kind][1], a[kind]);
          if (overhead && kind !== "twist") continue;
          if (a[kind] < lim[kind][0] || a[kind] > lim[kind][1])
            violations.push({ clip: clip.name, frame: f, bone, kind, value: round(a[kind]), limit: lim[kind] });
        }
        const prev = previous?.get(bone);
        const series = (steps[bone] ??= [0]);
        if (prev) {
          const step = qangle(prev, q);
          series.push(step);
          if (step > maxStep) {
            maxStep = step;
            maxStepBone = bone;
          }
        }
        if (baseName(bone) === "shin") knees[bone === "shin.R" ? 0 : 1].push(a.flex);
      }
      previous = current;
      first ??= current;
      const world = worldOf(locals);
      for (const bone of soleBones) {
        const skin = mmul(world(index.get(bone)!), restInv.get(bone)!);
        const mirror = isLeft(bone) ? -1 : 1;
        let low = Infinity;
        for (const [x, y, z] of SOLE_POINTS[baseName(bone)]) {
          // Blender armature voxels -> glTF metres (x, z, -y)
          const p = mpoint(skin, [(mirror * x) / 32, z / 32, -y / 32]);
          low = Math.min(low, p[1]);
        }
        minSole = Math.min(minSole, low);
        if (low < -CREW_FLOOR_TOLERANCE_M)
          violations.push({ clip: clip.name, frame: f, bone, kind: "floor", value: round(low * 32), limit: -CREW_FLOOR_TOLERANCE_M * 32 });
      }
    }
    // looping clips (last frame == first frame) wrap their neighbouring steps
    const loop = [...(first ?? new Map()).entries()].every(
      ([bone, q]) => qangle(q, previous!.get(bone)!) < 1,
    );
    for (const [bone, s] of Object.entries(steps))
      for (let f = 1; f < s.length; f++) {
        const before = f > 1 ? s[f - 1] : loop ? s[s.length - 1] : 0;
        const after = f < s.length - 1 ? s[f + 1] : loop ? s[1] : 0;
        const around = Math.max(before ?? 0, after ?? 0);
        if (s[f] > CREW_MAX_STEP_DEG || (s[f] > CREW_SPIKE_MIN_DEG && s[f] > CREW_SPIKE_RATIO * around))
          violations.push({ clip: clip.name, frame: f, bone, kind: "flip", value: round(s[f]), limit: CREW_MAX_STEP_DEG });
      }
    if (CREW_STANCE.clips.test(clip.name)) {
      knees[0].forEach((r, f) => {
        const support = Math.min(r, knees[1][f]);
        if (support > CREW_STANCE.supportKneeMaxDeg)
          violations.push({ clip: clip.name, frame: f, bone: "shin", kind: "stance", value: round(support), limit: CREW_STANCE.supportKneeMaxDeg });
      });
      knees.forEach((k, i) => {
        const swing = Math.max(...k) - Math.min(...k);
        if (swing > CREW_STANCE.kneeSwingMaxDeg)
          violations.push({ clip: clip.name, frame: 0, bone: i ? "shin.L" : "shin.R", kind: "stance", value: round(swing), limit: CREW_STANCE.kneeSwingMaxDeg });
      });
    }
    for (const r of Object.values(ranges))
      for (const k of ["flex", "side", "twist"] as const) r[k] = [round(r[k][0]), round(r[k][1])];
    clips.push({ clip: clip.name, frames, ranges, maxStepDeg: round(maxStep), maxStepBone, minSoleM: round(minSole, 4) });
  }
  return { file, clips, violations };
}

const round = (v: number, digits = 1) => Math.round(v * 10 ** digits) / 10 ** digits;

/** Violations grouped per clip/bone/kind with the worst frame (compact report rows). */
export function summarizeViolations(violations: readonly JointViolation[]) {
  const worst = new Map<string, JointViolation & { count: number }>();
  for (const v of violations) {
    const key = `${v.clip}|${v.bone}|${v.kind}`;
    const lim = v.limit;
    const excess = (x: JointViolation) =>
      typeof x.limit === "number"
        ? x.kind === "floor"
          ? x.limit - x.value
          : x.value - x.limit
        : Math.max(x.limit[0] - x.value, x.value - x.limit[1]);
    const hit = worst.get(key);
    if (!hit) worst.set(key, { ...v, limit: lim, count: 1 });
    else {
      hit.count++;
      if (excess(v) > excess(hit)) Object.assign(hit, { frame: v.frame, value: v.value });
    }
  }
  return [...worst.values()];
}
