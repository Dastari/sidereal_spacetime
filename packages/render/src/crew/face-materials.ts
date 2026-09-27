import {
  CHARACTER_EXPRESSIONS,
  CHARACTER_FACE_DETAILS,
  CHARACTER_FACIAL_HAIR,
  CHARACTER_FACE_AGES,
  CHARACTER_FACE_DEFAULTS,
} from "@sidereal/content/appearance";
import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { ResolvedCrewAppearance } from "./appearance";

/** GLB UVs already occupy one cell; only the offset changes, never the scale. */
export const CREW_FACE_ATLAS_COLUMNS = 16;
const ATLAS_CHOICES = {
  expression: CHARACTER_EXPRESSIONS,
  faceDetail: CHARACTER_FACE_DETAILS,
  facialHair: CHARACTER_FACIAL_HAIR,
  faceAge: CHARACTER_FACE_AGES,
} as const;
type AtlasChoice = keyof typeof ATLAS_CHOICES;
const FACE_ATLAS_ROLES: Readonly<Record<string, AtlasChoice>> = {
  "crew.face.eyes": "expression",
  "crew.face.iris": "expression",
  "crew.face.brows": "expression",
  "crew.face.mouth": "expression",
  "crew.face.detail": "faceDetail",
  "crew.face.facialHair": "facialHair",
  "crew.face.age": "faceAge",
};

/**
 * Materials belong to one loaded character. Texture wrappers may be shared by
 * glTF roles, so every independently selected atlas gets its own UV transform.
 * The clones share immutable image data; disposal leaves container sources intact.
 */
export function createCrewFaceMaterials(materials: readonly Material[]) {
  const roles = materials
    .filter(
      (material): material is PBRMaterial => material instanceof PBRMaterial,
    )
    .map((material) => ({
      material,
      role: material.name.replace(/\.\d+$/, ""),
    }));
  const atlases = roles.flatMap(({ material, role }) => {
    const choice = FACE_ATLAS_ROLES[role];
    const source = material.albedoTexture;
    if (!choice || !(source instanceof Texture)) return [];
    const texture = source.clone();
    texture.name = `${source.name}:${role}`;
    material.albedoTexture = texture;
    return [{ material, source, texture, choice }];
  });
  let disposed = false;
  return {
    apply(look: ResolvedCrewAppearance) {
      if (disposed) return;
      for (const { texture, choice } of atlases) {
        const choices: readonly string[] = ATLAS_CHOICES[choice];
        const requested = choices.indexOf(look[choice]);
        const index =
          requested < 0
            ? choices.indexOf(CHARACTER_FACE_DEFAULTS[choice])
            : requested;
        texture.uOffset = index / CREW_FACE_ATLAS_COLUMNS;
      }
      const hair = Color3.FromHexString(
        validHex(look.hair, "#47312c"),
      ).toLinearSpace();
      const eyes = Color3.FromHexString(
        validHex(look.eyes, CHARACTER_FACE_DEFAULTS.eyes),
      ).toLinearSpace();
      for (const { material, role } of roles) {
        switch (role) {
          case "crew.face.iris":
            material.albedoColor = eyes;
            break;
          case "crew.face.brows":
            // Keep bright dyed brows legible against pale skin under strong light.
            material.albedoColor = hair.scale(0.5);
            break;
          case "crew.face.facialHair":
            material.albedoColor = hair.scale(0.72);
            break;
          case "crew.hair.modular":
            material.albedoColor = hair;
            break;
          case "crew.hair.shadow":
            material.albedoColor = hair.scale(0.58);
            break;
          case "crew.hair.highlight":
            material.albedoColor = Color3.Lerp(hair, Color3.White(), 0.18);
            break;
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { material, source, texture } of atlases) {
        if (material.albedoTexture === texture) material.albedoTexture = source;
        texture.dispose();
      }
    },
  };
}

function validHex(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}
