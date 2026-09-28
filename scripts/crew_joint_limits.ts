/**
 * Joint-limit report for the crew animation GLBs (body r005 clips + CHAR-WEAPONS armed clips).
 *   npx tsx scripts/crew_joint_limits.ts [--json out.json] [--md out.md] [glb ...]
 * Exits 1 when any clip breaks an anatomical limit (see packages/content/src/crew-joint-limits.ts).
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  CREW_JOINT_LIMITS,
  CREW_MAX_STEP_DEG,
  CREW_FLOOR_TOLERANCE_M,
  summarizeViolations,
  validateCrewJointLimits,
} from "../packages/content/src/crew-joint-limits";

const DEFAULT = [
  "assets/runtime/crew/voxel/r005/crew-body.glb",
  "assets/runtime/crew/items/r001/armed-actions.glb",
];
const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const jsonOut = opt("--json");
const mdOut = opt("--md");
const files = args.length ? args : DEFAULT;
const reports = files.map((f) => validateCrewJointLimits(new Uint8Array(readFileSync(f)), f));
let failed = 0;
const lines: string[] = [
  "# crew_rig joint-limit report",
  "",
  `Limits (deg, flex/side/twist; + flex = anatomical flexion): ${Object.entries(CREW_JOINT_LIMITS)
    .map(([k, v]) => `${k} ${v.flex.join("..")}/${v.side.join("..")}/${v.twist.join("..")}`)
    .join("; ")}. Max per-frame rotation step ${CREW_MAX_STEP_DEG} deg; sole points >= -${(CREW_FLOOR_TOLERANCE_M * 32).toFixed(1)} vox.`,
  "",
];
for (const r of reports) {
  const frames = r.clips.reduce((n, c) => n + c.frames, 0);
  const rows = summarizeViolations(r.violations);
  failed += rows.length;
  lines.push(`## ${r.file}`, "", `${r.clips.length} clips, ${frames} frames sampled, ${r.violations.length} violating samples in ${rows.length} clip/bone/limit groups.`, "");
  if (rows.length) {
    lines.push("| clip | bone | limit | worst frame | worst value | limit range | frames |", "|---|---|---|---|---|---|---|");
    for (const v of rows)
      lines.push(`| ${v.clip} | ${v.bone} | ${v.kind} | ${v.frame} | ${v.value} | ${Array.isArray(v.limit) ? v.limit.join("..") : v.limit} | ${v.count} |`);
    lines.push("");
  }
  const knee = (c: (typeof r.clips)[number], b: string) => c.ranges[b]?.flex.join("..") ?? "-";
  lines.push("| clip | frames | knee R flex | knee L flex | elbow R flex | elbow L flex | max step (bone) | min sole (m) |", "|---|---|---|---|---|---|---|---|");
  for (const c of r.clips)
    lines.push(`| ${c.clip} | ${c.frames} | ${knee(c, "shin.R")} | ${knee(c, "shin.L")} | ${knee(c, "forearm.R")} | ${knee(c, "forearm.L")} | ${c.maxStepDeg} (${c.maxStepBone}) | ${c.minSoleM} |`);
  lines.push("");
}
const text = lines.join("\n");
if (mdOut) writeFileSync(mdOut, text + "\n");
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(reports, null, 1));
for (const r of reports) {
  const rows = summarizeViolations(r.violations);
  console.log(`${r.file}: ${r.clips.length} clips, ${rows.length} violation groups`);
  for (const v of rows.slice(0, 400))
    console.log(`  ${v.clip.padEnd(20)} ${v.bone.padEnd(12)} ${v.kind.padEnd(6)} f${String(v.frame).padEnd(3)} ${String(v.value).padStart(7)}  limit ${Array.isArray(v.limit) ? v.limit.join("..") : v.limit}  (${v.count} frames)`);
}
process.exit(failed ? 1 : 0);
