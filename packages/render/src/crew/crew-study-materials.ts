import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { SurfaceFamily } from "../molded-plastic";

const families: Record<string, SurfaceFamily> = {
  plastic: "plastic-colour",
  plastic_dark: "plastic-dark",
  cloth: "fabric",
  fabric: "fabric",
  hair: "plastic-colour",
  skin: "skin",
  metal: "metal",
  rubber: "rubber",
  glass: "glass",
  visor: "plastic-dark",
  emit: "emissive",
  emissive: "emissive",
};
/** Source palette supplies defaults; cosmetics retint only the appropriate material slots. */
export function studyMaterials(
  materials: readonly Material[],
  overrides: Record<string, string> = {},
  finish: Record<string, string> = {},
) {
  for (const material of materials) {
    if (!(material instanceof PBRMaterial)) continue;
    const slot = /^crew\.([a-z_]+)|^slot:([a-z_]+)@/.exec(material.name);
    const name = slot?.[1] ?? slot?.[2];
    if (!name || name === "face") continue;
    const color = overrides[name];
    if (color && /^#[0-9a-f]{6}$/i.test(color)) {
      material.albedoColor = Color3.FromHexString(color).toLinearSpace();
      if (name.startsWith("emit"))
        material.emissiveColor = material.albedoColor.clone();
    }
    const family =
      families[finish[name]] ??
      (name.startsWith("emit")
        ? "emissive"
        : name === "skin"
          ? "skin"
          : name === "metal"
            ? "metal"
            : name === "dark"
              ? "rubber"
              : name === "glass"
                ? "glass"
                : "plastic-colour");
    material.metadata = { ...material.metadata, studySurfaceFamily: family };
  }
}
