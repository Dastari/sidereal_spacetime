import { createHullPaintBinding } from "./hull-paint";
import { categoryMeshRole, setMeshRole } from "./mesh-roles";
/** Disposable local design preview. Proxies never replace approved asset exports or authority. */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import "@babylonjs/loaders/glTF";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { loadEquipmentPrototypes } from "./installed-equipment";
import type { PartCatalog } from "../../content/src/assembly";
import { fittingPolygon } from "../../sim/src/layout-compiler";
import { transformPoint } from "../../content/src/ship-layout";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { LayoutDocument, Point } from "../../content/src/ship-layout";
import type { CompiledLayout } from "../../sim/src/layout-compiler";
export function createLayoutPreview(
  canvas: HTMLCanvasElement,
  report: (stats: {
    meshes: number;
    indices: number;
    drawCalls: number;
    frameMs: number;
    textures: number;
    /** Estimated RGBA8 allocation including mipmaps; not a driver memory query. */
    textureBytesEstimate: number;
    shadows: number;
    origin: Point;
    nativePlacements: number;
    missingVisuals: number;
  }) => void,
) {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true }),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.028, 0.075, 0.105, 1);
  const camera = new ArcRotateCamera(
    "layout-camera",
    -Math.PI / 2.6,
    Math.PI / 3.2,
    40,
    Vector3.Zero(),
    scene,
  );
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.lowerBetaLimit = Math.PI / 3.2;
  camera.upperBetaLimit = Math.PI / 3.2;
  camera.minZ = 0.01;
  camera.maxZ = 1000;
  camera.attachControl(canvas, true);
  camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
  new HemisphericLight(
    "layout-fill",
    new Vector3(0.3, 1, 0.4),
    scene,
  ).intensity = 1.15;
  const floor = new StandardMaterial("draft-floor", scene),
    wall = new StandardMaterial("draft-wall", scene),
    roof = new StandardMaterial("draft-roof", scene);
  floor.diffuseColor = Color3.FromHexString("#536d7c");
  wall.diffuseColor = Color3.FromHexString("#aac0ca");
  roof.diffuseColor = Color3.FromHexString("#8caab7");
  roof.alpha = 0.25;
  for (const m of [floor, wall, roof]) {
    m.backFaceCulling = false;
    m.specularColor = new Color3(0.1, 0.1, 0.1);
  }
  const prototypes = new Map<string, Mesh[]>(),
    loading = new Set<string>(),
    failed = new Set<string>();
  let placedNodes: TransformNode[] = [],
    nativePlacements = 0,
    missingVisuals = 0,
    lastRequest: Parameters<typeof update> | null = null;
  let meshes: Mesh[] = [],
    origin: Point = [0, 0],
    extent = 24,
    disposed = false,
    lastReport = 0;
  function resize() {
    engine.resize();
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    camera.orthoLeft = (-extent * aspect) / 2;
    camera.orthoRight = (extent * aspect) / 2;
    camera.orthoTop = extent / 2;
    camera.orthoBottom = -extent / 2;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  function update(
    doc: LayoutDocument,
    result: CompiledLayout,
    deckId: string,
    showRoof: boolean,
    projection: string,
    catalog?: PartCatalog,
    showFloor = true,
  ) {
    lastRequest = [
      doc,
      result,
      deckId,
      showRoof,
      projection,
      catalog,
      showFloor,
    ];
    placedNodes.forEach((n) => n.dispose());
    placedNodes = [];
    nativePlacements = 0;
    missingVisuals = 0;
    meshes.forEach((m) => m.dispose());
    meshes = [];
    const tiles = result.tiles.filter((t) => t.deckId === deckId),
      deck = doc.decks.find((d) => d.id === deckId);
    if (!deck) return;
    origin = [
      (result.bounds.min[0] + result.bounds.max[0]) / 2,
      (result.bounds.min[1] + result.bounds.max[1]) / 2,
    ];
    extent = Math.max(
      12,
      ((result.bounds.max[1] - result.bounds.min[1]) / 32) * 1.7,
      ((result.bounds.max[0] - result.bounds.min[0]) / 32) * 0.9,
    );
    camera.lowerBetaLimit = projection === "3D" ? Math.PI / 3.2 : Math.PI / 2;
    camera.upperBetaLimit = camera.lowerBetaLimit;
    camera.alpha =
      projection === "Front"
        ? 0
        : projection === "3D"
          ? -Math.PI / 2.6
          : -Math.PI / 2;
    camera.beta = camera.lowerBetaLimit;
    camera.setTarget(new Vector3(0, deck.ceiling / 64, 0));
    function batch(
      name: string,
      faces: { p: Point[]; z: number[] }[],
      material: StandardMaterial,
    ) {
      const positions: number[] = [],
        indices: number[] = [];
      for (const face of faces) {
        const start = positions.length / 3;
        face.p.forEach((p, i) =>
          positions.push(
            (p[0] - origin[0]) / 32,
            face.z[i] / 32,
            -(p[1] - origin[1]) / 32,
          ),
        );
        for (let i = 1; i < face.p.length - 1; i++)
          indices.push(start, start + i, start + i + 1);
      }
      if (!indices.length) return;
      const m = new Mesh(name, scene),
        data = new VertexData();
      setMeshRole(m, "effect");
      data.positions = positions;
      data.indices = indices;
      const normals: number[] = [];
      VertexData.ComputeNormals(positions, indices, normals, {
        useRightHandedSystem: true,
      });
      data.normals = normals;
      data.applyToMesh(m);
      m.material = material;
      meshes.push(m);
    }
    floor.diffuseColor = Color3.FromHexString(doc.appearance.primary);
    wall.diffuseColor = Color3.FromHexString(doc.appearance.primary);
    roof.diffuseColor = Color3.FromHexString(doc.appearance.accent);
    batch(
      "draft-floor",
      (showFloor ? tiles : []).map((t) => ({
        p: t.vertices,
        z: t.vertices.map(() => 0),
      })),
      floor,
    );
    batch(
      "draft-enclosing-walls",
      result.walls
        .filter((w) => w.deckId === deckId)
        .map((w) => ({
          p: [w.a, w.b, w.b, w.a],
          z: [0, 0, deck.ceiling, deck.ceiling],
        })),
      wall,
    );
    if (showRoof)
      batch(
        "draft-roof",
        tiles.map((t) => ({
          p: t.vertices,
          z: t.vertices.map(() => deck.ceiling),
        })),
        roof,
      );
    const proxyFaces: { p: Point[]; z: number[] }[] = [];
    for (const f of doc.fittings.filter((f) => f.deckId === deckId)) {
      const asset = catalog?.assets.find((a) => a.id === f.definitionId),
        sources = prototypes.get(f.definitionId);
      const usable = asset?.visual?.sha256 === f.revision && !f.reflected;
      if (usable && sources) {
        const node = new TransformNode("draft-fitting-" + f.id, scene),
          offset = transformPoint(
            [asset.bounds.min[0] * 32, asset.bounds.min[1] * 32],
            f.quarterTurns,
          );
        node.position.set(
          (f.position[0] - offset[0] - origin[0]) / 32,
          -asset.bounds.min[2],
          -(f.position[1] - offset[1] - origin[1]) / 32,
        );
        node.rotation.y = (f.quarterTurns * Math.PI) / 2;
        node.metadata = { draftPlacementId: f.id };
        const painter = createHullPaintBinding(node, asset, f.paint);
        for (const source of sources) {
          const mesh = painter
            ? painter.clone(source, "native-draft-" + f.id)
            : source.createInstance("native-draft-" + f.id);
          mesh.metadata = {
            ...source.metadata,
            partId: f.id,
            role: categoryMeshRole(asset.category),
          };
          mesh.parent = node;
          mesh.isVisible = true;
          mesh.isPickable = false;
        }
        placedNodes.push(node);
        nativePlacements++;
      } else {
        missingVisuals++;
        const poly = fittingPolygon(f),
          height = 32;
        proxyFaces.push({ p: poly, z: poly.map(() => height) });
        for (let i = 0; i < poly.length; i++)
          proxyFaces.push({
            p: [
              poly[i],
              poly[(i + 1) % poly.length],
              poly[(i + 1) % poly.length],
              poly[i],
            ],
            z: [0, 0, height, height],
          });
        if (
          usable &&
          asset &&
          !loading.has(asset.id) &&
          !failed.has(asset.id)
        ) {
          loading.add(asset.id);
          loadEquipmentPrototypes(scene, [asset])
            .then((found) => {
              if (disposed) return;
              for (const [id, sources] of found) prototypes.set(id, sources);
              if (lastRequest) update(...lastRequest);
            })
            .catch(() => {
              failed.add(asset.id);
            })
            .finally(() => loading.delete(asset.id));
        }
      }
    }
    batch("unresolved-fitting-proxies", proxyFaces, wall);
    resize();
  }
  engine.runRenderLoop(() => {
    if (disposed) return;
    const start = performance.now(),
      drawsBefore = engine._drawCalls.current;
    scene.render();
    if (start - lastReport > 1000) {
      lastReport = start;
      report({
        meshes: scene.getActiveMeshes().length,
        indices: scene
          .getActiveMeshes()
          .data.slice(0, scene.getActiveMeshes().length)
          .reduce((s, m) => s + m.getTotalIndices(), 0),
        drawCalls: engine._drawCalls.current - drawsBefore,
        frameMs: performance.now() - start,
        textures: scene.textures.length,
        textureBytesEstimate: Math.round(
          [
            ...new Set(
              scene.textures
                .map((t) => t.getInternalTexture())
                .filter((t) => t !== null),
            ),
          ].reduce(
            (sum, t) =>
              sum +
              t.width *
                t.height *
                4 *
                (t.isCube ? 6 : 1) *
                (t.generateMipMaps ? 4 / 3 : 1),
            0,
          ),
        ),
        shadows: 0,
        origin,
        nativePlacements,
        missingVisuals,
      });
    }
  });
  return {
    update,
    dispose() {
      disposed = true;
      observer.disconnect();
      scene.dispose();
      engine.dispose();
    },
  };
}
