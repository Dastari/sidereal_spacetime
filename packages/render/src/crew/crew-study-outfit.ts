import type { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  CREW_STUDY,
  crewStudyEquipment,
  crewStudyHair,
  crewStudyPartFile,
  crewStudyUrl,
  type StudyPartRequest,
} from "@sidereal/content/crew-study";
import type { CrewAppearance } from "./appearance";
import { resolveCrewAppearance } from "./appearance";
import type { createVoxelCrewVisual } from "./voxel-crew";
import { partitionCrewTriangles } from "./voxel-crew-regions";
import { studyCrewPalette, studyMaterials } from "./crew-study-materials";
import {
  composeCrewFace,
  hexToRgb255,
  loadCrewFaceAtlas,
} from "./crew-study-face";
import { toneCrewEmissive } from "./voxel-crew-outfit";

type Crew = Awaited<ReturnType<typeof createVoxelCrewVisual>>;
type Attachment = {
  id: string;
  covers: string[];
  recolor(colors: Record<string, string>): void;
  stow(on: boolean): void;
  dispose(): void;
};
type Wanted = StudyPartRequest & { mode?: string; state?: string };

/** Successful loaded parts own coverage. Requests retain old visibility until they settle. */
export function createStudyCrewOutfit(
  scene: Scene,
  crew: Crew,
  options: {
    onChange?: () => void;
    load?: (url: string) => Promise<AssetContainer>;
    face?: false;
  } = {},
) {
  let disposed = false;
  let pending = 0;
  let appearance: CrewAppearance = {};
  let currentPalette: Record<string, string> = {};
  let paletteKey = "";
  let hairState = "stand";
  let seated = false;
  let faceKey = "";
  let faceGeneration = 0;
  const wanted = new Map<string, string>();
  const generations = new Map<string, number>();
  const active = new Map<string, Attachment>();
  const rests = ["hair.1", "hair.2"].map((name) => {
    const joint = crew.joints.get(name);
    return {
      joint,
      q: joint?.rotationQuaternion?.clone(),
      p: joint?.position.clone(),
    };
  });
  const changed = () => {
    if (disposed) return;
    const covers = new Set([...active.values()].flatMap((part) => part.covers));
    crew.setStudyCoverage(covers);
    crew.setHiddenRegions(
      [...covers].filter(
        (region) =>
          region === "head" || region === "hands" || region === "hair",
      ) as ("head" | "hands" | "hair")[],
    );
    toneCrewEmissive(crew.root.getChildMeshes());
    options.onChange?.();
  };
  const load =
    options.load ??
    ((url: string) =>
      SceneLoader.LoadAssetContainerAsync("", url, scene, undefined, ".glb"));
  function sync(
    slot: string,
    request: Wanted | undefined,
    female: boolean,
    recolor: boolean,
  ) {
    const file =
      request &&
      crewStudyPartFile(request.id, female, request.mode, request.state);
    const key =
      request && file
        ? JSON.stringify([
            file.file,
            request.id,
            request.regions,
            request.mode,
            female,
          ])
        : "";
    if ((wanted.get(slot) ?? "") === key) {
      if (recolor) active.get(slot)?.recolor(currentPalette);
      return;
    }
    wanted.set(slot, key);
    const generation = (generations.get(slot) ?? 0) + 1;
    generations.set(slot, generation);
    if (!file || !request) {
      active.get(slot)?.dispose();
      active.delete(slot);
      changed();
      return;
    }
    pending++;
    void load(crewStudyUrl(file.file))
      .then((container) => {
        if (disposed || generations.get(slot) !== generation) {
          container.dispose();
          return;
        }
        const meshes = container.meshes.filter(
          (mesh) => mesh.getTotalVertices() > 0,
        );
        if (
          !meshes.length ||
          container.skeletons.length !== 1 ||
          container.skeletons.some(
            (skin) =>
              skin.bones.length !== crew.joints.size ||
              skin.bones.some((bone) => !crew.joints.has(bone.name)),
          )
        ) {
          container.dispose();
          throw new Error(`Incompatible study part ${request.id}`);
        }
        if (request.regions) {
          for (const mesh of meshes)
            if (mesh instanceof Mesh) {
              const selected = [...partitionCrewTriangles(mesh, true)].filter(
                ([region]) => request.regions!.includes(region),
              );
              mesh.makeGeometryUnique();
              const indices = selected.flatMap(([, bucket]) => bucket);
              if (!indices.length) mesh.setEnabled(false);
              else mesh.setIndices(indices);
            }
          if (
            !meshes.some((mesh) => mesh.isEnabled() && mesh.getTotalIndices())
          ) {
            container.dispose();
            throw new Error(`Empty study regions for ${request.id}`);
          }
        }
        const part = CREW_STUDY.parts[request.id];
        const unattach = crew.attachPart(container);
        const registry = studyMaterials(
          container.materials,
          currentPalette,
          part.families,
        );
        const covers = request.regions
          ? part.covers.filter((region) => request.regions!.includes(region))
          : [...part.covers];
        covers.push(...(part.covers_by_mode?.[request.mode ?? "full"] ?? []));
        active.get(slot)?.dispose();
        const enabled = meshes.map((mesh) => mesh.isEnabled());
        const attachment = {
          id: request.id,
          covers,
          recolor(colors: Record<string, string>) {
            registry.setPalette(colors);
          },
          stow(on: boolean) {
            meshes.forEach((mesh, i) => mesh.setEnabled(!on && enabled[i]));
          },
          dispose: unattach,
        };
        // Equipped back gear stays loaded and authoritative while its visual is
        // stowed against a chair. A late load must honor the current seat state.
        if (slot === "back") attachment.stow(seated);
        active.set(slot, attachment);
        changed();
      })
      .catch((error) => {
        if (disposed || generations.get(slot) !== generation) return;
        // An obsolete old outfit must not survive a rejected new request or hide base fallback.
        active.get(slot)?.dispose();
        active.delete(slot);
        changed();
        console.warn(`Crew study part ${request.id} unavailable`, error);
      })
      .finally(() => {
        pending--;
      });
  }
  function apply(next: CrewAppearance) {
    if (disposed) return;
    appearance = next;
    const look = resolveCrewAppearance(next);
    const female = look.bodyType === "female";
    const requests = new Map<string, Wanted>();
    const chestId = next.equippedComponents?.chest;
    const wearerRole =
      chestId &&
      crewStudyEquipment("chest", chestId)?.id === "uniform.scientist"
        ? "scientist"
        : undefined;
    for (const [slot, id] of Object.entries(next.equippedComponents ?? {})) {
      if (!id) continue;
      const part = crewStudyEquipment(slot, id, female, wearerRole);
      if (part) requests.set(slot, part);
    }
    // The sealed body item includes its pressure gloves. A separately equipped
    // glove item may replace that presentation; no inventory slot or grant is added.
    if (
      next.equippedComponents?.uniform === "wardrobe-suit-body" &&
      !requests.has("gloves")
    )
      requests.set("gloves", { id: "gloves.flight" });
    // A full uniform owns garment regions already represented by a role chest or legs.
    if (requests.has("uniform"))
      for (const slot of ["chest", "legs"]) {
        if (requests.get(slot)?.id.startsWith("uniform."))
          requests.delete(slot);
      }
    // Existing armor items own their authored underlayers without granting a uniform item.
    const chest = requests.get("chest");
    if (!requests.has("uniform") && chest?.id.startsWith("armor.chest."))
      requests.set("chest-cloth", {
        id:
          chest.id === "armor.chest.t3" ? "uniform.marine" : "uniform.civilian",
        regions: ["torso", "upperArms", "forearms"],
      });
    if (
      !requests.has("uniform") &&
      requests.get("legs")?.id === "armor.legs.t3"
    )
      requests.set("legs-cloth", {
        id: "uniform.marine",
        regions: ["hips", "legs"],
      });
    const ranking = ["full", "cap", "fringe", "hidden"];
    let mode = "full";
    for (const request of requests.values()) {
      const part = CREW_STUDY.parts[request.id];
      const candidate = part.hair_mode ?? "full";
      if (ranking.indexOf(candidate) > ranking.indexOf(mode)) mode = candidate;
    }
    const rolePart = requests.get("uniform")?.id ?? requests.get("chest")?.id;
    const defaultRole =
      appearance.hairStyle === undefined
        ? rolePart === "uniform.scientist"
          ? "scientist"
          : rolePart === "armor.chest.t3"
            ? "marine"
            : undefined
        : undefined;
    const hair = crewStudyHair(look.hairStyle, female, defaultRole);
    if (hair && mode !== "hidden")
      requests.set("hair", { id: hair, mode, state: hairState });
    const facial = look.facialHair;
    if (mode !== "hidden" && facial && facial !== "none") {
      const id = `facial.${facial === "moustache" ? "moustache" : facial}`;
      if (CREW_STUDY.parts[id]) requests.set("facial", { id, mode: "full" });
    }
    const colors = studyCrewPalette(next);
    const nextPaletteKey = JSON.stringify(colors);
    const recolor = paletteKey !== nextPaletteKey;
    if (recolor) {
      currentPalette = colors;
      paletteKey = nextPaletteKey;
    }
    for (const slot of new Set([...wanted.keys(), ...requests.keys()]))
      sync(slot, requests.get(slot), female, recolor);
    if (recolor) options.onChange?.();
    if (options.face !== false) {
      const variant = look.faceVariant;
      const key = JSON.stringify([
        variant,
        look.skin,
        look.hair,
        look.eyes,
        look.faceAge,
        look.faceDetail,
      ]);
      if (key !== faceKey) {
        faceKey = key;
        const generation = ++faceGeneration;
        const face = CREW_STUDY.face[variant];
        pending++;
        void loadCrewFaceAtlas(crewStudyUrl(face.json), crewStudyUrl(face.png))
          .then(({ atlas, image }) => {
            if (disposed || generation !== faceGeneration) return;
            const material = crew.root
              .getChildMeshes()
              .map((mesh) => mesh.material)
              .find(
                (m): m is PBRMaterial =>
                  m instanceof PBRMaterial && /^crew\.face/.test(m.name),
              );
            if (!material) return;
            crew.face.setComposer(material, (state) =>
              composeCrewFace(
                atlas,
                image,
                {
                  ...state,
                  detail:
                    look.faceDetail === "scar" ? "scars" : look.faceDetail,
                  age:
                    look.faceAge === "mature"
                      ? "lines"
                      : look.faceAge === "elder"
                        ? "older"
                        : "none",
                },
                {
                  skin: hexToRgb255(look.skin),
                  hair: hexToRgb255(look.hair),
                  eye: hexToRgb255(look.eyes),
                },
              ),
            );
          })
          .catch((error) => console.warn("Crew study face unavailable", error))
          .finally(() => {
            pending--;
          });
      }
    }
  }
  // The live mapper supplies seated/dead/downed states. Clip bone attitude also covers lying poses.
  let candidateState = "stand";
  let heldFor = 0;
  const observer = scene.onBeforeRenderObservable.add(() => {
    const clips = crew.activeClips;
    const nextSeated = clips.some((clip) => /sit|pilot_/.test(clip));
    if (nextSeated !== seated) {
      seated = nextSeated;
      active.get("back")?.stow(seated);
    }
    let nextState = nextSeated ? "seated" : "stand";
    const chest = crew.joints.get("chest");
    if (
      nextState === "stand" &&
      chest &&
      clips.some((clip) => /death|knocked_out|sleep|lying/.test(clip))
    ) {
      const world = chest.computeWorldMatrix(true);
      const up = Vector3.TransformNormal(Vector3.Up(), world).normalize();
      const forward = Vector3.TransformNormal(
        new Vector3(0, 0, -1),
        world,
      ).normalize();
      if (Math.abs(up.y) < 0.35)
        nextState =
          Math.abs(forward.y) > 0.6
            ? "lying"
            : forward.x > 0
              ? "lying_r"
              : "lying_l";
    }
    if (nextState !== candidateState) {
      candidateState = nextState;
      heldFor = 0;
    } else heldFor += Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    if (nextState !== hairState && heldFor >= 0.1) {
      hairState = nextState;
      apply(appearance);
    }
  });
  const hairObserver = scene.onAfterAnimationsObservable.add(() => {
    if (hairState === "stand") return;
    for (const { joint, q, p } of rests)
      if (joint) {
        joint.rotationQuaternion = q?.clone() ?? Quaternion.Identity();
        if (p) joint.position.copyFrom(p);
      }
  });
  return {
    apply,
    get pending() {
      return pending;
    },
    get armour() {
      return Object.fromEntries(
        [...active]
          .filter(([slot]) => !["hair", "facial"].includes(slot))
          .map(([slot, part]) => [slot, part.id]),
      );
    },
    get headArtStatus() {
      return { revision: CREW_STUDY.revision, error: undefined };
    },
    get hairState() {
      return hairState;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      faceGeneration++;
      scene.onBeforeRenderObservable.remove(observer);
      scene.onAfterAnimationsObservable.remove(hairObserver);
      for (const part of active.values()) part.dispose();
      active.clear();
      crew.setStudyCoverage([]);
      crew.setHiddenRegions([]);
    },
  };
}
