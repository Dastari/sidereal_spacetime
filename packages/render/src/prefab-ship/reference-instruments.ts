/** Finite diegetic screen art: one small atlas per style, shared by the authored console family. */
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import type { ShipKitSlot } from "@sidereal/content/ship-kit";
import type { SurfaceChannels } from "./surface-attributes";

export interface ReferenceInstrumentSelection {
  revision: string;
  id: string;
  slot: ShipKitSlot;
}
type InstrumentKind = "navigation" | "systems";
interface Pool {
  textures: Map<InstrumentKind, DynamicTexture>;
  materials: Map<string, PBRMaterial>;
}
const pools = new WeakMap<Scene, Pool>();
const SIZE = 256;

export function referenceInstrumentSelectionOf(
  material: Material | null,
): ReferenceInstrumentSelection | undefined {
  return material?.metadata?.shipReferenceInstrument as
    ReferenceInstrumentSelection | undefined;
}

function instrumentKind(id: string): InstrumentKind | undefined {
  if (
    id === "shipyard.equipment.bridge-bank" ||
    id.startsWith("console.navigation")
  )
    return "navigation";
  if (
    id.startsWith("console.") ||
    id === "pale-studless.console.standard" ||
    id === "shipyard.equipment.workshop-bank-r025" ||
    id === "shipyard.equipment.medical-equipment-bank-r025"
  )
    return "systems";
  return undefined;
}

function drawInstrument(texture: DynamicTexture, kind: InstrumentKind) {
  const c = texture.getContext();
  c.fillStyle = "#051320";
  c.fillRect(0, 0, SIZE, SIZE);
  c.strokeStyle = "#174256";
  c.lineWidth = 3;
  c.strokeRect(7, 7, 242, 242);
  c.fillStyle = "#16394e";
  c.fillRect(10, 10, 236, 32);
  c.fillStyle = "#9eeaf4";
  c.font = "bold 20px monospace";
  c.fillText(kind === "navigation" ? "NAV / 07" : "SYSTEM / 04", 19, 34);
  c.fillStyle = "#f2b65b";
  c.fillRect(216, 21, 17, 8);
  c.strokeStyle = "#174256";
  c.lineWidth = 2;
  for (let y = 62; y < 208; y += 24) {
    c.beginPath();
    c.moveTo(18, y);
    c.lineTo(238, y);
    c.stroke();
  }
  if (kind === "navigation") {
    for (const radius of [28, 53, 78]) {
      c.beginPath();
      c.arc(117, 129, radius, 0, Math.PI * 2);
      c.stroke();
    }
    c.strokeStyle = "#5accdf";
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(53, 176);
    c.lineTo(89, 144);
    c.lineTo(112, 136);
    c.lineTo(147, 103);
    c.lineTo(174, 84);
    c.stroke();
    c.fillStyle = "#b8f4f8";
    c.beginPath();
    c.moveTo(117, 117);
    c.lineTo(109, 138);
    c.lineTo(125, 138);
    c.closePath();
    c.fill();
    for (const [x, y] of [
      [58, 97],
      [171, 164],
      [155, 92],
    ]) {
      c.fillStyle = "#f2b65b";
      c.fillRect(x, y, 7, 7);
    }
    c.fillStyle = "#3c8ca7";
    for (let i = 0; i < 6; i++) c.fillRect(214, 62 + i * 22, 17, 10);
  } else {
    for (let i = 0; i < 4; i++) {
      c.fillStyle = "#174256";
      c.fillRect(22, 59 + i * 33, 209, 17);
      c.fillStyle = i === 2 ? "#dfa151" : "#57c9db";
      c.fillRect(22, 59 + i * 33, [160, 121, 178, 143][i], 17);
      c.fillStyle = "#bedfe7";
      c.fillRect(222, 63 + i * 33, 9, 9);
    }
    c.strokeStyle = "#69d4ce";
    c.lineWidth = 4;
    c.beginPath();
    for (let i = 0; i < 9; i++) {
      const x = 22 + i * 26,
        y = 207 - [8, 3, 15, 12, 24, 18, 23, 18, 27][i];
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }
  c.fillStyle = "#173749";
  c.fillRect(18, 222, 220, 15);
  c.fillStyle = "#4bb7cd";
  c.fillRect(18, 222, 137, 15);
  c.fillStyle = "#9eeaf4";
  c.fillRect(165, 225, 33, 8);
  c.fillStyle = "#dda052";
  c.fillRect(211, 225, 27, 8);
  texture.update(false);
}

/** Console display UVs are authored independently of world-space panel detail. No lamp gets an atlas. */
export function referenceInstrumentMaterial(
  base: PBRMaterial,
  selection: ReferenceInstrumentSelection,
  channels: SurfaceChannels,
): PBRMaterial {
  if (selection.revision !== "r002" || selection.slot !== "emit_a") return base;
  const kind = instrumentKind(selection.id);
  if (!kind) return base;
  const uv = channels.uvs;
  if (!uv || uv.length < 6 || uv.length % 2 || channels.uvsComplete === false)
    throw Error("Reference instrument requires complete display UVs");
  for (let i = 0; i < uv.length; i++)
    if (!Number.isFinite(uv[i]) || uv[i] < -1e-5 || uv[i] > 1.00001)
      throw Error("Reference instrument requires normalized display UVs");
  const scene = base.getScene();
  if (scene.isDisposed)
    throw Error("Scene disposed during instrument preparation");
  let pool = pools.get(scene);
  if (!pool) {
    pool = { textures: new Map(), materials: new Map() };
    pools.set(scene, pool);
    scene.onDisposeObservable.addOnce(() => {
      for (const material of pool!.materials.values())
        material.dispose(false, false);
      for (const texture of pool!.textures.values()) texture.dispose();
      pools.delete(scene);
    });
  }
  const key = `${base.uniqueId}:${kind}`;
  const cached = pool.materials.get(key);
  if (cached) return cached;
  let texture = pool.textures.get(kind);
  if (!texture) {
    texture = new DynamicTexture(
      `reference-r002:instrument:${kind}`,
      SIZE,
      scene,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    drawInstrument(texture, kind);
    pool.textures.set(kind, texture);
  }
  const material = base.clone(`reference-r002:display:${base.name}:${kind}`)!;
  const reflectionClone = material.reflectionTexture;
  material.reflectionTexture = base.reflectionTexture;
  if (reflectionClone && reflectionClone !== base.reflectionTexture)
    reflectionClone.dispose();
  material.imageProcessingConfiguration = base.imageProcessingConfiguration;
  material.albedoTexture = material.emissiveTexture = texture;
  material.albedoColor = material.emissiveColor = Color3.White();
  material.metadata = {
    ...base.metadata,
    shipReferenceInstrument: Object.freeze({ ...selection, kind }),
  };
  pool.materials.set(key, material);
  return material;
}
