import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { bytesToHex } from "@noble/hashes/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  AUTHORED_TEMPLATE_KIT_BASE,
  AUTHORED_TEMPLATE_KIT_REVISION,
  AUTHORED_TEMPLATE_KIT_MANIFEST_SHA256,
  readAuthoredTemplateKit,
} from "@sidereal/content/authored-template-kit";
import {
  WAYFARER_AUTHORED_STUDY_PINS,
  readWayfarerAuthoredStudy,
  type AuthoredStudyPiece,
} from "@sidereal/content/wayfarer-authored-study";
import {
  prefabOrigin,
  type ShipPrefabDocumentV1,
  type ShipThemeId,
  type PrefabComponentCatalog,
} from "@sidereal/content/ship-prefab";
import { SHIP_THEMES } from "@sidereal/content/ship-themes";
import type { ShipKitSlot } from "@sidereal/content/ship-kit";
import { compileAuthoredTemplatePlan } from "@sidereal/sim/authored-template-plan";
import type { DressedShip } from "@sidereal/sim/ship-dresser";
import {
  createAuthoredAssetLighting,
  readAuthoredAssetLighting,
  type AuthoredAssetLighting,
} from "../authored-asset-lighting";
import {
  loadAuthoredStudy,
  authoredInstanceMatrix,
  type AuthoredPieceInput,
} from "./wayfarer-authored-study";
import {
  clipAuthoredGeometry,
  authoredProfilePoint,
  prefabClipPlanes,
} from "./authored-template-geometry";
import {
  authoredTemplateObjects,
  authoredTemplateComponents,
} from "./authored-template-objects";
import { authoredTemplatePropulsion } from "./authored-template-propulsion";
import { setMeshRole } from "../mesh-roles";

const PROP_BASE = "/assets/ship-study/wayfarer-authored-r001/";
const LIGHT_URL =
  "/assets/ship-study/wayfarer-object-lighting-r002/descriptor.json";
const LIGHT_PIN =
  "58e7ab323edbadc488dcbc707e40a431249011bebf59ecfe205df1359540a017";
async function bytes(url: string, pin?: string) {
  const response = await fetch(url);
  if (!response.ok) throw Error(`Authored template asset unavailable: ${url}`);
  const result = new Uint8Array(await response.arrayBuffer());
  if (pin && bytesToHex(sha256(result)) !== pin)
    throw Error(`Changed authored template source: ${url}`);
  return result;
}
async function json(url: string, pin?: string): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await bytes(url, pin)));
}

/** Native authored surfaces shared by live prefab ships and the editable Shipyard renderer. */
export async function buildAuthoredTemplateView(
  scene: Scene,
  root: TransformNode,
  doc: ShipPrefabDocumentV1,
  dressed: DressedShip,
  options: {
    catalog: PrefabComponentCatalog;
    exteriorOnly?: boolean;
    theme: ShipThemeId;
    standinComponents?: boolean;
  },
) {
  const plan = compileAuthoredTemplatePlan(doc, { catalog: options.catalog });
  const [kit, props, propLighting] = await Promise.all([
    json(
      AUTHORED_TEMPLATE_KIT_BASE + "manifest.json",
      AUTHORED_TEMPLATE_KIT_MANIFEST_SHA256,
    ).then(readAuthoredTemplateKit),
    Promise.all([
      json(
        PROP_BASE + "manifest.json",
        WAYFARER_AUTHORED_STUDY_PINS.manifestSha256,
      ),
      json(
        PROP_BASE + "layout.json",
        WAYFARER_AUTHORED_STUDY_PINS.layoutSha256,
      ),
      json(PROP_BASE + "descriptor.json"),
    ]).then((args) => readWayfarerAuthoredStudy(args[0], args[1], args[2])),
    json(LIGHT_URL, LIGHT_PIN).then(readAuthoredAssetLighting),
  ]);
  const propMap = new Map(props.pieces.map((p) => [p.id, p]));
  const propulsion = options.standinComponents
    ? { pieces: [], instances: [], replacedMounts: new Set<string>() }
    : authoredTemplatePropulsion(dressed, propMap, options.catalog);
  const objectRows =
    options.exteriorOnly || options.standinComponents
      ? []
      : [
          ...authoredTemplateObjects(dressed, propMap),
          ...authoredTemplateComponents(dressed, propMap),
        ];
  const source = new Map<string, AuthoredStudyPiece & { base: string }>([
    ...kit.pieces.map(
      (p) => [p.id, { ...p, base: AUTHORED_TEMPLATE_KIT_BASE }] as const,
    ),
    ...props.pieces.map((p) => [p.id, { ...p, base: PROP_BASE }] as const),
    ...propulsion.pieces.map((p) => [p.id, p] as const),
  ]);
  const origin = prefabOrigin(doc),
    rows = [...plan.instances, ...objectRows, ...propulsion.instances];
  const lighting = new Map<string, AuthoredAssetLighting>(propLighting);
  if (kit.lighting)
    for (const [pin, asset] of readAuthoredAssetLighting(kit.lighting))
      lighting.set(pin, asset);
  const banks: {
    tag: "deck" | "flight";
    parent: TransformNode;
    loaded: Awaited<ReturnType<typeof loadAuthoredStudy>>;
    lights: ReturnType<typeof createAuthoredAssetLighting>;
  }[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const b of banks) {
      b.lights.dispose();
      b.loaded.dispose();
      b.parent.dispose();
    }
  };
  try {
    for (const tag of options.exteriorOnly
      ? (["flight"] as const)
      : (["deck", "flight"] as const)) {
      const parent = new TransformNode(
        `authored-template:${doc.id}:${tag}`,
        scene,
      );
      parent.parent = root;
      parent.setEnabled(false);
      let loaded: Awaited<ReturnType<typeof loadAuthoredStudy>> | undefined;
      try {
        const instances = rows.filter(
          (r) => r.view === "both" || r.view === tag,
        );
        const required = [...new Set(instances.map((r) => r.piece))].map(
          (id) => {
            const piece = source.get(id);
            if (!piece) throw Error(`Incomplete authored template kit: ${id}`);
            return piece;
          },
        );
        const byObject = new Map(plan.instances.map((r) => [r.object, r]));
        loaded = await loadAuthoredStudy(
          scene,
          required,
          instances,
          { ...props.palette, ...kit.palette },
          origin,
          (p: AuthoredPieceInput) => {
            const s = source.get(p.id)!;
            return bytes(s.base + p.file, p.sha256);
          },
          {
            // Remote exteriors have no local-light receivers. Keeping cabin
            // regions here fragments one opaque material into hundreds of
            // draw submissions per hull. Native channels and placement ranges
            // stay intact; blended surfaces keep the loader's depth sorting.
            batchRegions: options.exteriorOnly
              ? undefined
              : new Map(
                  instances.map((r) => [r.object, `${r.role}:${r.region}`]),
                ),
            assetLighting: lighting,
            transformGeometry: (row, geometry, transform) => {
              const modifier = byObject.get(row.object);
              if (!modifier?.clipPlanes?.length && !modifier?.verticalProfile)
                return { geometry, transform };
              return {
                geometry: clipAuthoredGeometry(
                  geometry,
                  transform,
                  prefabClipPlanes(modifier.clipPlanes ?? [], origin),
                  modifier.verticalProfile,
                  origin,
                ),
                transform: Matrix.Identity(),
              };
            },
          },
        );
        for (const mesh of loaded.meshes) {
          mesh.parent = parent;
          mesh.isPickable = false;
          mesh.metadata.roleRanges =
            mesh.metadata.authoredStudy.placementRanges.map(
              (r: {
                role: string;
                indexStart: number;
                indexCount: number;
              }) => ({
                role: r.role,
                first: r.indexStart,
                count: r.indexCount,
              }),
            );
          const ranges = mesh.metadata.authoredStudy.placementRanges as {
            role: string;
          }[];
          setMeshRole(
            mesh,
            ranges.every((r) => r.role === "floor")
              ? "floor"
              : ranges.every((r) => r.role === "equipment")
                ? "equipment"
                : "hull",
          );
        }
        const sockets = options.exteriorOnly
          ? []
          : instances.flatMap((row) => {
              const piece = source.get(row.piece)!,
                asset = lighting.get(piece.sha256);
              if (!asset?.sockets.length) return [];
              const matrix = Matrix.FromArray(
                authoredInstanceMatrix(piece.frame, row.matrix, origin),
              );
              const modifier = byObject.get(row.object);
              const profile = modifier?.verticalProfile;
              const clipping = prefabClipPlanes(
                modifier?.clipPlanes ?? [],
                origin,
              );
              // Bake the complete geometry transform, including shear, rather than decomposing it.
              const sockets = asset.sockets.map((socket) => {
                let position = Vector3.TransformCoordinates(
                  Vector3.FromArray(Array.from(socket.position)),
                  matrix,
                );
                let direction =
                  socket.direction &&
                  Vector3.TransformNormal(
                    Vector3.FromArray(Array.from(socket.direction)),
                    matrix,
                  );
                if (profile) {
                  const warped = authoredProfilePoint(
                    position,
                    profile,
                    origin,
                  );
                  position = warped.position;
                  if (direction)
                    direction = Vector3.TransformNormal(
                      direction,
                      warped.jacobian,
                    );
                }
                return {
                  ...socket,
                  position: position.asArray(),
                  ...(direction
                    ? { direction: direction.normalize().asArray() }
                    : {}),
                };
              });
              const retainedSockets = sockets.filter((s) =>
                clipping.every(
                  (p) =>
                    p[0] * s.position[0] +
                      p[1] * s.position[1] +
                      p[2] * s.position[2] +
                      p[3] >=
                    -1e-8,
                ),
              );
              if (!retainedSockets.length) return [];
              return [
                {
                  id: row.object,
                  matrix: Matrix.Identity().asArray(),
                  asset: { ...asset, sockets: retainedSockets },
                  receivers: loaded!.meshes.filter((m) => {
                    if (
                      m.metadata.authoredStudy.receiverRegion ===
                      `${row.role}:${row.region}`
                    )
                      return true;
                    if (row.object.startsWith("propulsion:")) return false;
                    if (
                      !m.metadata.authoredStudy.placementRanges.every(
                        (r: { role: string }) => r.role === "floor",
                      )
                    )
                      return false;
                    const bounds = m.getBoundingInfo().boundingBox;
                    // Spatially bounded source sockets respect the floor's independent culling chunks.
                    return retainedSockets.some((socket) => {
                      const p = Vector3.FromArray(socket.position);
                      return (
                        Vector3.DistanceSquared(
                          p,
                          Vector3.Clamp(p, bounds.minimum, bounds.maximum),
                        ) <=
                        socket.range ** 2
                      );
                    });
                  }),
                },
              ];
            });
        const lights = createAuthoredAssetLighting(scene, parent, sockets);
        banks.push({ tag, parent, loaded, lights });
      } catch (error) {
        loaded?.dispose();
        parent.dispose();
        throw error;
      }
    }
    const applyTheme = (theme: ShipThemeId) => {
      for (const b of banks)
        for (const mesh of b.loaded.meshes) {
          const material = mesh.material;
          if (!(material instanceof PBRMaterial)) continue;
          const slot =
            kit.palette[material.name]?.sourceSlotName ??
            material.name.split("@")[0];
          if (
            [
              "primary",
              "secondary",
              "accent",
              "trim",
              "dark",
              "metal",
            ].includes(slot)
          )
            material.albedoColor = Color3.FromArray(
              SHIP_THEMES[theme].slots[slot as ShipKitSlot].colour,
            );
          if (slot === "emit_a" || slot === "emit_b")
            material.emissiveColor = Color3.FromArray(
              SHIP_THEMES[theme].slots[slot].colour,
            );
        }
    };
    applyTheme(options.theme);
    return {
      plan,
      replacedMounts: propulsion.replacedMounts,
      nativeComponentCount:
        propulsion.replacedMounts.size +
        (options.exteriorOnly || options.standinComponents
          ? 0
          : authoredTemplateComponents(dressed, propMap).length),
      revision: AUTHORED_TEMPLATE_KIT_REVISION,
      banks,
      dispose,
      setTheme: applyTheme,
      setView(view: "deck" | "flight") {
        for (const b of banks) {
          const enabled = b.tag === view;
          b.parent.setEnabled(enabled);
          b.lights.setEnabled(enabled);
        }
      },
      emissiveMeshes() {
        return banks.flatMap((b) =>
          b.loaded.meshes.filter(
            (m) =>
              m.material instanceof PBRMaterial &&
              (m.material.emissiveColor.r +
                m.material.emissiveColor.g +
                m.material.emissiveColor.b >
                0 ||
                m.material.emissiveTexture),
          ),
        );
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
