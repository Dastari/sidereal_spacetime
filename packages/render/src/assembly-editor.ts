import { categoryMeshRole, setMeshRole } from "./mesh-roles";
import { updateHullDecals } from "./hull-decals";
import { loadEquipmentPrototypes } from "./installed-equipment";
import "@babylonjs/core/Culling/ray";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import "@babylonjs/loaders/glTF";
import type {
  AssemblyDocument,
  PartCatalog,
  PartCategory,
} from "../../content/src/assembly";
import { RPG_BETA } from "./camera";
import { createEquipmentLighting } from "./equipment-lighting";
export async function createAssemblyEditor(
  canvas: HTMLCanvasElement,
  catalog: PartCatalog,
  onSelect: (id: string) => void,
  onMove: (
    id: string,
    position: [number, number, number],
    copy: boolean,
  ) => void,
  onDamage: (id: string, cells: [number, number, number][]) => void,
  onError: (error: string) => void,
) {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true }),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0, 0, 0, 0);
  const camera = new ArcRotateCamera(
    "assembly-camera",
    3.65,
    RPG_BETA,
    55,
    Vector3.Zero(),
    scene,
  );
  camera.fov = 0.55;
  camera.minZ = 0.1;
  camera.maxZ = 600;
  camera.lowerRadiusLimit = 8;
  camera.upperRadiusLimit = 140;
  camera.lowerBetaLimit = RPG_BETA;
  camera.upperBetaLimit = RPG_BETA;
  // Prevent browser autoscroll while middle-dragging; right-drag keeps panning.
  camera.attachControl(canvas, false);
  camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
  const pointerInput = camera.inputs.attached.pointers as unknown as {
    buttons: number[];
  };
  pointerInput.buttons = [1, 2];
  let tool: "select" | "pan" = "select",
    space = false;
  camera.movement.input.addEntry({
    source: "pointer",
    button: 1,
    interaction: "rotate",
  });
  new HemisphericLight("workshop-fill", new Vector3(0, 1, 0), scene).intensity =
    0.75;
  new DirectionalLight(
    "workshop-key",
    new Vector3(-0.4, -1, 0.3),
    scene,
  ).intensity = 1.5;
  scene.environmentTexture = new HDRCubeTexture(
    "/assets/materials/frontier-workshop.hdr",
    scene,
    128,
    false,
    true,
    false,
    true,
  );
  scene.environmentIntensity = 0.5;
  const [imported, voxelLibrary] = await Promise.all([
    SceneLoader.ImportMeshAsync("", "/assets/assembly/", "parts.glb", scene),
    fetch("/assets/assembly/catalog.voxels.json").then((r) => r.json()),
  ]);
  const prototypes = new Map<string, Mesh[]>();
  for (const mesh of imported.meshes) {
    mesh.isPickable = false;
    if (!(mesh instanceof Mesh) || mesh.getTotalVertices() === 0) continue;
    const id = mesh.name.match(/^GEO-(part-[a-f0-9]+)--/)?.[1];
    if (!id) continue;
    mesh.isVisible = false;
    const list = prototypes.get(id) ?? [];
    list.push(mesh);
    prototypes.set(id, list);
  }
  for (const [id, meshes] of await loadEquipmentPrototypes(
    scene,
    catalog.assets.filter((a) => a.category !== "cargo"),
  ))
    prototypes.set(id, meshes);
  // The cargo catalog is a library, not 73 simultaneously visible models.
  for (const asset of catalog.assets)
    if (asset.category === "cargo" && asset.visual) prototypes.delete(asset.id);
  const pendingCargo = new Map<string, Promise<void>>();
  const nodes = new Map<
    string,
    {
      assetId: string;
      node: TransformNode;
      lighting: ReturnType<typeof createEquipmentLighting>;
    }
  >();
  const worker = new Worker(new URL("./voxel-worker.ts", import.meta.url), {
      type: "module",
    }),
    jobs = new Map<string, { revision: number; signature: string }>();
  const previewMaterials = new Map<string, PBRMaterial>();
  for (const [surface, metal, rough] of [
    ["paint", 0.38, 0.42],
    ["steel", 0.8, 0.32],
    ["soft", 0, 0.85],
    ["emitter", 0, 0.5],
  ] as const) {
    const m = new PBRMaterial("exposed-voxel-" + surface, scene);
    m.metallic = metal;
    m.roughness = rough;
    m.backFaceCulling = false;
    if (surface === "emitter") m.emissiveColor = new Color3(0.025, 1, 1.8);
    previewMaterials.set(surface, m);
  }
  let damageTool = false,
    jobSerial = 0;
  worker.onmessage = (e) => {
    const { id, revision, result, error } = e.data;
    if (jobs.get(id)?.revision !== revision) return;
    if (error) {
      onError(error);
      return;
    }
    const entry = nodes.get(id);
    if (!entry) return;
    for (const child of entry.node.getChildMeshes())
      if (child.metadata?.damagePreview) child.dispose();
      else child.setEnabled(false);
    for (const chunk of result) {
      if (!chunk.indices.length) continue;
      const mesh = new Mesh("damage-" + id + "-" + chunk.key, scene);
      setMeshRole(mesh, "effect");
      const data = new VertexData();
      Object.assign(data, chunk);
      data.applyToMesh(mesh);
      mesh.material = previewMaterials.get(chunk.surface)!;
      mesh.parent = entry.node;
      mesh.metadata = { damagePreview: true, role: "effect" };
      mesh.isPickable = true;
    }
    entry.lighting.setMeshes(entry.node.getChildMeshes());
  };
  let doc: AssemblyDocument | undefined,
    selected = "",
    visible = new Set<PartCategory>();
  let drag:
    { id: string; start: Vector3; origin: Vector3; copy: boolean } | undefined;
  function point(clientX: number, clientY: number, height = 0) {
    const rect = canvas.getBoundingClientRect();
    const ray = scene.createPickingRay(
      ((clientX - rect.left) * engine.getRenderWidth()) / rect.width,
      ((clientY - rect.top) * engine.getRenderHeight()) / rect.height,
      null,
      camera,
    );
    const distance = ray.intersectsPlane(new Plane(0, 1, 0, -height));
    return distance === null
      ? null
      : ray.origin.add(ray.direction.scale(distance));
  }
  const pointer = scene.onPointerObservable.add((info) => {
    if (
      info.type === PointerEventTypes.POINTERDOWN &&
      info.event.button === 0 &&
      tool !== "pan" &&
      !space
    ) {
      const id = info.pickInfo?.pickedMesh?.parent?.metadata?.partId as
        string | undefined;
      if (!id) {
        onSelect("");
        return;
      }
      onSelect(id);
      const entry = nodes.get(id)!;
      const hit = point(
        info.event.clientX,
        info.event.clientY,
        entry.node.position.y,
      );
      if (damageTool && info.pickInfo?.pickedPoint) {
        if (catalog.assets.find((a) => a.id === entry.assetId)?.visual) return;
        const source = voxelLibrary.volumes[entry.assetId],
          position = Vector3.TransformCoordinates(
            info.pickInfo.pickedPoint,
            Matrix.Invert(entry.node.computeWorldMatrix(true)),
          );
        const center = [
          position.x / source.cellMeters,
          -position.z / source.cellMeters,
          position.y / source.cellMeters,
        ];
        const radius = Math.ceil(0.3 / source.cellMeters),
          cells: [number, number, number][] = [];
        for (let z = -radius; z <= radius; z++)
          for (let y = -radius; y <= radius; y++)
            for (let x = -radius; x <= radius; x++)
              if (x * x + y * y + z * z <= radius * radius)
                cells.push([
                  Math.floor(center[0]) + x,
                  Math.floor(center[1]) + y,
                  Math.floor(center[2]) + z,
                ]);
        onDamage(id, cells);
        return;
      }
      if (hit) {
        drag = {
          id,
          start: hit,
          origin: entry.node.position.clone(),
          copy: info.event.ctrlKey || info.event.metaKey,
        };
        canvas.dataset.gestureActive = "true";
        canvas.setPointerCapture((info.event as PointerEvent).pointerId);
      }
    } else if (info.type === PointerEventTypes.POINTERMOVE && drag) {
      const hit = point(info.event.clientX, info.event.clientY, drag.origin.y);
      if (!hit) return;
      const position = drag.origin.add(hit.subtract(drag.start));
      position.x = Math.round(position.x * 32) / 32;
      position.z = Math.round(position.z * 32) / 32;
      nodes.get(drag.id)?.node.position.copyFrom(position);
    } else if (info.type === PointerEventTypes.POINTERUP && drag) {
      const position = nodes.get(drag.id)!.node.position.clone();
      nodes.get(drag.id)!.node.position.copyFrom(drag.origin);
      if (!position.equals(drag.origin))
        onMove(drag.id, [position.x, -position.z, position.y], drag.copy);
      drag = undefined;
      canvas.dataset.gestureActive = "false";
    }
  });
  const cancel = () => {
    space = false;
    pointerInput.buttons = tool === "pan" ? [0, 1, 2] : [1, 2];
    if (drag) {
      nodes.get(drag.id)?.node.position.copyFrom(drag.origin);
      drag = undefined;
      canvas.dataset.gestureActive = "false";
    }
  };
  const keys = (e: KeyboardEvent) => {
    if (e.code === "Space" && (document.activeElement === canvas || space)) {
      e.preventDefault();
      space = e.type === "keydown";
      pointerInput.buttons = space || tool === "pan" ? [0, 1, 2] : [1, 2];
      camera.movement.input.setInteraction(
        "pointer",
        { button: 0 },
        space || tool === "pan" ? "pan" : "rotate",
      );
    }
    if (e.key === "Escape") cancel();
  };
  window.addEventListener("keydown", keys);
  window.addEventListener("keyup", keys);
  const context = (e: Event) => e.preventDefault();
  canvas.addEventListener("contextmenu", context);
  canvas.addEventListener("pointercancel", cancel);
  window.addEventListener("blur", cancel);
  const resize = new ResizeObserver(() => engine.resize());
  resize.observe(canvas);
  engine.runRenderLoop(() => scene.render());
  const handle = {
    cancel,
    tool(value: "select" | "pan") {
      cancel();
      tool = value;
      pointerInput.buttons = value === "pan" ? [0, 1, 2] : [1, 2];
      camera.movement.input.setInteraction(
        "pointer",
        { button: 0 },
        value === "pan" ? "pan" : "rotate",
      );
    },
    update(
      next: AssemblyDocument,
      id: string,
      layers: ReadonlySet<PartCategory>,
    ) {
      doc = next;
      selected = id;
      visible = new Set(layers);
      const ids = new Set(doc.parts.map((p) => p.id));
      for (const [key, e] of nodes)
        if (!ids.has(key)) {
          e.lighting.dispose();
          e.node.dispose();
          nodes.delete(key);
          jobs.delete(key);
        }
      for (const part of doc.parts) {
        let entry = nodes.get(part.id);
        if (entry && entry.assetId !== part.assetId) {
          entry.lighting.dispose();
          entry.node.dispose();
          nodes.delete(part.id);
          jobs.delete(part.id);
          entry = undefined;
        }
        if (!entry) {
          const sources = prototypes.get(part.assetId);
          if (!sources) {
            const asset = catalog.assets.find((a) => a.id === part.assetId);
            if (asset?.visual && asset.category === "cargo") {
              if (!pendingCargo.has(asset.id)) {
                const pending = loadEquipmentPrototypes(scene, [asset])
                  .then((result) => {
                    if (scene.isDisposed) return;
                    prototypes.set(asset.id, result.get(asset.id)!);
                    if (doc) handle.update(doc, selected, visible);
                  })
                  .catch((error) => {
                    if (!scene.isDisposed) onError(String(error));
                  });
                pendingCargo.set(asset.id, pending);
              }
              continue;
            }
            throw new Error("Part asset missing: " + part.assetId);
          }
          const node = new TransformNode("placement-" + part.id, scene);
          node.metadata = { partId: part.id };
          const fixtures = catalog.assets.find(
            (a) => a.id === part.assetId,
          )?.lights;
          for (const source of sources) {
            // Babylon hardware instances bind source-mesh lighting. A lightweight
            // clone shares geometry but permits lights scoped to this placement.
            const name = part.id + "--" + source.name;
            const instance = fixtures?.length
              ? source.clone(name, node, true)!
              : source.createInstance(name);
            instance.metadata = {
              ...source.metadata,
              partId: part.id,
              role: categoryMeshRole(
                catalog.assets.find((a) => a.id === part.assetId)?.category ??
                  "equipment",
              ),
            };
            instance.parent = node;
            instance.isPickable = true;
            instance.isVisible = true;
          }
          const lighting = createEquipmentLighting(scene, node, fixtures);
          lighting.setMeshes(node.getChildMeshes());
          entry = { assetId: part.assetId, node, lighting };
          nodes.set(part.id, entry);
        }
        updateHullDecals(scene, entry.node, part.decals, part.flipped);
        const category = catalog.assets.find(
          (a) => a.id === part.assetId,
        )!.category;
        entry.node.setEnabled(visible.has(category));
        entry.node.position.set(
          part.position[0],
          part.position[2],
          -part.position[1],
        );
        // Documents use east/north/height; imported source uses renderer Y-up.
        entry.node.rotation.y = part.rotation;
        entry.node.scaling.x = part.flipped ? -1 : 1;
        for (const mesh of entry.node.getChildMeshes())
          mesh.showBoundingBox = part.id === selected;
        const signature = JSON.stringify(part.removedCells),
          last = jobs.get(part.id);
        if (signature !== last?.signature) {
          const revision = ++jobSerial;
          jobs.set(part.id, { signature, revision });
          if (
            part.removedCells.length &&
            !catalog.assets.find((a) => a.id === part.assetId)?.visual
          )
            worker.postMessage({
              id: part.id,
              revision,
              source: voxelLibrary.volumes[part.assetId],
              removed: part.removedCells,
              palette: voxelLibrary.palette,
            });
          else
            for (const child of entry.node.getChildMeshes())
              if (child.metadata?.damagePreview) child.dispose();
              else child.setEnabled(true);
        }
      }
    },
    async ready() {
      await Promise.all(pendingCargo.values());
      return scene.whenReadyAsync();
    },
    dropPoint(x: number, y: number): [number, number, number] {
      const p = point(x, y);
      return p
        ? [Math.round(p.x * 2) / 2, -Math.round(p.z * 2) / 2, 0]
        : [0, 0, 0];
    },
    focus(id: string) {
      const n = nodes.get(id);
      if (n) {
        camera.target.copyFrom(n.node.position);
        camera.radius = 12;
      }
    },
    fit() {
      camera.target.setAll(0);
      camera.radius = 55;
    },
    damageTool(enabled: boolean) {
      damageTool = enabled;
    },
    dispose() {
      cancel();
      worker.terminate();
      resize.disconnect();
      scene.onPointerObservable.remove(pointer);
      canvas.removeEventListener("contextmenu", context);
      canvas.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", keys);
      window.removeEventListener("keyup", keys);
      scene.dispose();
      engine.dispose();
    },
  };
  return handle;
}
