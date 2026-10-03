import type {
  AuthoredStudyInstance,
  AuthoredStudyPiece,
} from "@sidereal/content/wayfarer-authored-study";
import type { AuthoredPieceInput } from "./wayfarer-authored-study";

/** Source pins remain immutable; only live intact presentation selects these derivatives. */
export const WAYFARER_POST_APERTURES: Readonly<
  Record<string, AuthoredPieceInput>
> = {
  "int.post.pink": {
    id: "int.post.pink",
    file: "int.post.pink.aperture.glb",
    sha256: "91fbb20830f0dcdb1178b9062370ef9c6851e7a48ce43edcf781d1ad274fc562",
    triangles: 1052,
    frame: "piece-local",
  },
  "int.post.white": {
    id: "int.post.white",
    file: "int.post.white.aperture.glb",
    sha256: "83c180a53c954c9e6566858c0694ed8fdde991ccebf5ebb5885bc90adf16b1ed",
    triangles: 1052,
    frame: "piece-local",
  },
};

/** Isolate the two compact cyan lamp lenses and three rear pods from pooled screen/trim materials. */
export function wayfarerEmitterStrength(
  piece: AuthoredPieceInput,
  material: string,
  source: number,
): number {
  const limit =
    material === "emit_a"
      ? piece.id === "prop.props_bridge.wall_light_cyan_v"
        ? 1.7
        : piece.id === "engine.pod.w2.4.l5.z-0.75_1.6"
          ? 1.55
          : 1
      : 1;
  return Math.min(source, limit);
}

/** Fill the source's omitted camera-facing long wall with existing authored architectural panels.
 * These are wall dressing only: no cloned room-specific fixtures or new interactive equipment.
 */
export function wayfarerNearWallPlacements(
  pieces: readonly AuthoredStudyPiece[],
): AuthoredStudyInstance[] {
  const variants = [
    "int.wallpanel.cockpit+amber.w1.s0.i1",
    "int.wallpanel.cockpit+cyanbox.w1.s0.i1",
    "int.wallpanel.machinery.w1.s0.i0.25",
  ];
  const available = new Set(pieces.map((piece) => piece.id));
  const result: AuthoredStudyInstance[] = [];
  const add = (object: string, piece: string, x: number, y: number) => {
    if (!available.has(piece))
      throw Error(`Missing near-wall source piece: ${piece}`);
    const matrix = [
      [1, 0, 0, x],
      [0, 1, 0, y],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    result.push({
      object,
      piece,
      role: "wall-dressing",
      room: null,
      matrix,
      originalMatrix: matrix,
      frame: "piece-local",
      trueScale: true,
      mirrored: false,
    });
  };
  for (let k = 0; k < 15; k++) {
    const piece = variants[k % variants.length];
    // Machinery source is authored on the stern's 0.25m inner offset; translate
    // the same unscaled mesh to the long wall's 1m offset.
    add(
      `WALL_near_${String(k).padStart(2, "0")}`,
      piece,
      -10.5 + k,
      piece.includes("machinery") ? 5.75 : 6.5,
    );
    add(
      `LINER_near_${String(k).padStart(2, "0")}`,
      `int.rimliner.v${k % 3}.w1`,
      -10.5 + k,
      6.5,
    );
  }
  // The original quarter-width terminal panel and rim fit the stern remainder.
  add("WALL_near_terminal", "int.wallbay.far.15.w0.25", -10.75, 6.5);
  add("LINER_near_terminal", "int.rimliner.v0.w0.25", -10.75, 6.5);
  return result;
}
