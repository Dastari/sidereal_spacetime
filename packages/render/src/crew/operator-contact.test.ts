import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createVoxelCrewVisual } from "./voxel-crew";
import { createVoxelHeldItem } from "./voxel-held-item";
import { createOperatorContact, operatorItemStow } from "./operator-contact";
import {
  prepareOperatorEnsemble,
  operatorMaterialKey,
  type OperatorEnsembleLoaders,
  type OperatorEnsembleRequest,
} from "./operator-ensemble";
import { verifyCrewSource } from "./crew-asset-cache";
import { crewItem } from "@sidereal/content/crew-items";
import { VOXEL_CREW_UPPER_BONES } from "@sidereal/content/crew-voxel-bundle";
import sourceTable from "./operator-visual-sources.json";
import profiles from "./operator-contact-profiles.json";

const engines: NullEngine[] = [];
afterEach(() => {
  engines.splice(0).forEach((engine) => engine.dispose());
  vi.restoreAllMocks();
});
const body = new Uint8Array(
  readFileSync(
    new URL(
      "../../../../assets/runtime/crew/voxel/r005/crew-body.glb",
      import.meta.url,
    ),
  ),
);

test.each(["male", "female"] as const)(
  "%s controls use the measured hand pole and follow a moving parent without a new frame",
  async (bodyType) => {
    const engine = new NullEngine();
    engines.push(engine);
    const scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    const parent = new TransformNode("moving-ship", scene),
      stage = new TransformNode("independent-stage", scene);
    stage.parent = parent;
    const capturedLocal = Matrix.Translation(0, 0.1875, -3.5);
    const placement = {
      profileId: profiles.profileId,
      navigationSha256: profiles.navigationSha256,
      associationKey: "visit",
      navigationLocal: capturedLocal,
      acceptedX: 0,
      acceptedY: 3.5,
      standingElevationM: 0.1875,
    };
    // Preparation crosses a real parent motion; the captured LOCAL frame must not borrow old world coordinates.
    const loading = createVoxelCrewVisual(scene, stage, body, {
      faceAtlas: false,
    });
    parent.position.set(30, 2, -8);
    parent.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), 0.7);
    const crew = await loading;
    crew.customize({ bodyType });
    const held = createVoxelHeldItem(scene, crew, { instant: () => true });
    held.set(null);
    await held.whenComplete();
    const contact = createOperatorContact(
      scene,
      stage,
      crew,
      held,
      placement,
      "visit",
      null,
    );
    const evaluate = () => {
      scene.onBeforeAnimationsObservable.notifyObservers(scene);
      scene.onAfterAnimationsObservable.notifyObservers(scene);
    };
    evaluate();
    await contact.whenEvaluated();
    contact.assertReady();
    expect(contact.residual).toBeLessThanOrEqual(1e-4);
    const relative = stage
      .computeWorldMatrix(true)
      .multiply(parent.computeWorldMatrix(true).clone().invert());
    Array.from(relative.m).forEach((value, i) =>
      expect(value).toBeCloseTo(capturedLocal.m[i], 5),
    );
    parent.position.set(-20, 3, 12);
    parent.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), -1.1);
    evaluate();
    contact.assertReady();
    for (const side of ["L", "R"] as const) {
      const actual = crew.joints.get(`hand.${side}`)!.computeWorldMatrix(true);
      const expected = Matrix.FromArray(profiles.wristMatrices[side]).multiply(
        stage.computeWorldMatrix(true),
      );
      expect(
        Vector3.Distance(actual.getTranslation(), expected.getTranslation()),
      ).toBeLessThan(1e-4);
      Array.from(actual.m)
        .slice(0, 12)
        .forEach((value, i) => expect(value).toBeCloseTo(expected.m[i], 4));
    }
    scene.onAfterRenderObservable.notifyObservers(scene);
    contact.freeze();
    const checkpoint = crew.joints.get("pelvis")!.position.clone();
    crew.update({ moving: true, seated: false, dead: true });
    crew.play("wave");
    crew.setMotionOverride({ moving: true });
    crew.setSeatContact(undefined);
    evaluate();
    expect(contact.frozen).toBe(true);
    expect(crew.joints.get("pelvis")!.position.asArray()).toEqual(
      checkpoint.asArray(),
    );
    contact.dispose();
    contact.dispose();
    held.dispose();
    crew.dispose();
  },
);

test("static item profiles require the exact actual source; unsupported hand visuals cannot become empty-hand fits", () => {
  for (const [id, item] of Object.entries(profiles.items)) {
    const first = operatorItemStow(id, item.sha256);
    expect(Array.from(first.matrix.m).every(Number.isFinite)).toBe(true);
    expect(() => operatorItemStow(id, "0".repeat(64))).toThrow();
  }
  expect(() => operatorItemStow("shield-pack", "0".repeat(64))).toThrow();
  expect(() => operatorItemStow("unknown", "0".repeat(64))).toThrow();
});

// Actual body/item/armed GLBs and controllers; shader readiness is a controlled source-unit port.
// This proves dual ownership and node transforms, not GPU/native fit or the full outfit cohort.
test("the physical and ordinary ensembles independently own the CURRENT real pistol; transfer never disposes the restored one", async () => {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const parent = new TransformNode("ship", scene);
  const verified = async (url: keyof typeof sourceTable.sources) => {
    const bytes = new Uint8Array(
      readFileSync(
        new URL(
          "../../../../assets/runtime/" + url.slice("/assets/".length),
          import.meta.url,
        ),
      ),
    );
    return verifyCrewSource(bytes, sourceTable.sources[url]);
  };
  const [bodySource, armedClips, pistol] = await Promise.all([
    verified("/assets/crew/voxel/r005/crew-body.glb"),
    verified("/assets/crew/items/r001/armed-actions.glb"),
    verified("/assets/crew/items/r001/pistol.glb"),
  ]);
  const request: OperatorEnsembleRequest = {
    associationKey: "same-current-request",
    requestedKey: "current-pistol",
    bodySource,
    appearance: { bodyType: "female", equippedComponents: {}, weapon: "none" },
    faceAtlas: false,
    requiredBodyNodes: [
      "pelvis",
      ...VOXEL_CREW_UPPER_BONES,
      ...["L", "R"].flatMap((side) =>
        ["thigh", "shin", "foot", "toe"].map((bone) => `${bone}.${side}`),
      ),
    ],
    requiredBodyClips: ["idle", "walk", "sit", "sit_idle"],
    outfitSources: {
      head: new Map(),
      headAtlases: new Map(),
      armor: () => undefined,
    },
    heldItem: "pistol",
    heldSources: {
      armedClips,
      item: (id) =>
        id === "pistol"
          ? {
              source: pistol,
              requiredSockets: Object.keys(crewItem("pistol").sockets) as never,
            }
          : undefined,
    },
  };
  const ports: OperatorEnsembleLoaders = {
    body: createVoxelCrewVisual,
    held: createVoxelHeldItem,
    outfit: () =>
      ({
        apply: () => undefined,
        whenComplete: async () => undefined,
        armour: {},
        dispose: vi.fn(),
      }) as unknown as ReturnType<OperatorEnsembleLoaders["outfit"]>,
    materials: async (actualScene, meshes) => {
      for (const mesh of meshes)
        for (const sub of mesh.subMeshes ?? []) {
          const material = sub.getMaterial();
          if (material && !vi.isMockFunction(material.isReadyForSubMesh))
            vi.spyOn(material, "isReadyForSubMesh").mockReturnValue(true);
        }
      return operatorMaterialKey(actualScene, meshes);
    },
  };
  const timer = setInterval(() => {
    scene.onBeforeAnimationsObservable.notifyObservers(scene);
    scene.onAfterAnimationsObservable.notifyObservers(scene);
  }, 1);
  let physical;
  try {
    physical = await prepareOperatorEnsemble(
      scene,
      parent,
      request,
      ports,
      undefined,
      {
        profileId: profiles.profileId,
        navigationSha256: profiles.navigationSha256,
        associationKey: request.associationKey,
        navigationLocal: Matrix.Identity(),
        acceptedX: 0,
        acceptedY: 0,
        standingElevationM: 0,
      },
    );
  } finally {
    clearInterval(timer);
  }
  const ordinary = physical.ordinaryBaseline!;
  expect(ordinary).toBeDefined();
  expect(ordinary.contact).toBeUndefined();
  expect(ordinary.crew).not.toBe(physical.crew);
  expect(ordinary.held.visual).not.toBe(physical.held.visual);
  expect(ordinary.held.itemId).toBe("pistol");
  expect(physical.held.itemId).toBe("pistol");
  expect(physical.held.visual!.root.parent?.name).toBe("operator-owned-stow");
  expect(ordinary.held.visual!.root.parent).toBe(
    ordinary.crew.socketNodes["socket.hand.R"],
  );
  expect(
    physical.root
      .getChildMeshes()
      .some((mesh) => mesh.isDescendantOf(physical.held.visual!.root)),
  ).toBe(true);
  physical.activate();
  expect(ordinary.root.isEnabled(false)).toBe(false);
  ordinary.root.position.set(1, 0, -2);
  ordinary.crew.update({ moving: false, seated: false, dead: true });
  ordinary.activate();
  physical.releaseOrdinaryBaseline!(ordinary);
  physical.dispose();
  expect(physical.root.isDisposed()).toBe(true);
  expect(ordinary.root.isDisposed()).toBe(false);
  expect(ordinary.held.visual!.root.isDisposed()).toBe(false);
  expect(ordinary.root.isEnabled()).toBe(true);
  ordinary.dispose();
  expect(ordinary.root.isDisposed()).toBe(true);
});
