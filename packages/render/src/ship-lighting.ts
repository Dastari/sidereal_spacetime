import type { Light } from "@babylonjs/core/Lights/light";
import { prepareShadowPolicy, isStructuralShadowSource } from "./shadow-policy";
import { createShadowBatches } from "./shadow-batches";
import type { ManagedLocalLight } from "./local-light-budget";
import { isCabinMesh } from "./cabin-visibility";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Geometry } from "@babylonjs/core/Meshes/geometry";
import { createShadowPlacementCache, sphereIntersectsSpot } from "./ship-shadow-cache";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { cabinLineOfSight } from "./ship-occlusion";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { CABIN_ROOMS } from "../../content/src/interior";

/** Authored lab luminaires, not utility simulation or permission grants.
 * World XY becomes renderer X/-Z. Cutaway never turns the sun into a cabin lamp.
 */
export function createShipLighting(
  scene: Scene,
  root: TransformNode,
  meshes: AbstractMesh[],
) {
  const fill = new HemisphericLight("low-neutral-bounce", Vector3.Up(), scene);
  fill.intensity = 0.12;
  fill.groundColor = new Color3(0.025, 0.035, 0.06);
  fill.diffuse = new Color3(0.72, 0.8, 1);
  const sun = new DirectionalLight(
    "exterior-key",
    new Vector3(-0.6, -1, 0.45),
    scene,
  );
  sun.position.set(18, 30, -18);
  sun.diffuse = new Color3(0.93, 0.95, 1);
  sun.intensity = 2.1;
  sun.specular.set(0.3, 0.3, 0.3);
  // A directional source's radius broadens glTF PBR lobes; keep molded edge
  // highlights readable without raising ambient or every material's specular.
  sun.radius = 0.04;
  sun.autoCalcShadowZBounds = true;
  const interior = meshes.filter((m) =>
    /GEO-(deck|room|partitions|equipment|cutaway)/.test(m.name),
  );
  sun.excludedMeshes = interior;
  const exteriorShadows = steppedShadow(sun, 1024);
  exteriorShadows.usePercentageCloserFiltering = true;
  exteriorShadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
  exteriorShadows.bias = 0.0035;
  exteriorShadows.normalBias = 0.015;
  for (const mesh of meshes) {
    prepareShadowPolicy(mesh);
    mesh.receiveShadows = true;
    if (mesh.getTotalVertices() > 0 && !mesh.metadata?.hullDecal && !mesh.metadata?.shadowExcluded) exteriorShadows.addShadowCaster(mesh);
    if (mesh.material && "maxSimultaneousLights" in mesh.material)
      mesh.material.maxSimultaneousLights = 8;
    if (mesh.material && "enableSpecularAntiAliasing" in mesh.material)
      mesh.material.enableSpecularAntiAliasing = true;
  }
  const roomLights = CABIN_ROOMS.map((room) => {
    // One bounded area approximation between each room's pair of wall fixtures.
    const side = Math.sign(room.x);
    const light = new SpotLight(
      "room-luminaire-" + room.id,
      new Vector3(side * 4.35, 2.38, -room.y),
      new Vector3(-side * 0.55, -1, 0),
      2.15,
      1,
      scene,
    );
    light.parent = root;
    light.range = 6;
    light.radius = 0.25;
    light.diffuse = Color3.FromHexString(
      room.id === "medbay"
        ? "#c5e7ff"
        : room.id === "hydroponics"
          ? "#e1efbf"
          : "#ffd3a0",
    );
    light.intensity = 14;
    light.specular.set(0.25, 0.25, 0.25);
    // Whole-deck batches must receive all room pools. Room props receive their own.
    light.includedOnlyMeshes = meshes.filter(
      (m) =>
        /GEO-(deck|walls|partitions|cutaway)/.test(m.name) ||
        m.name.includes("GEO-room-" + room.id) ||
        m.name.includes("GEO-equipment-locker"),
    );
    return { room, light };
  });
  const accents = CABIN_ROOMS.map((room) => {
    const light = new PointLight(
      "door-spill-" + room.id,
      new Vector3(Math.sign(room.x) * 1.4, 1.38, -room.y),
      scene,
    );
    light.parent = root;
    light.range = 2.4;
    light.intensity = 1.2;
    light.diffuse = Color3.FromHexString("#38b8ff");
    light.includedOnlyMeshes = meshes.filter((m) =>
      m.name.includes("GEO-room-" + room.id),
    );
    return light;
  });
  const bridge = new SpotLight(
    "bridge-console-spill",
    new Vector3(0, 2.2, -7.2),
    new Vector3(0, -1, 0.5),
    2.3,
    1,
    scene,
  );
  bridge.parent = root;
  bridge.diffuse = Color3.FromHexString("#83caff");
  bridge.intensity = 9;
  bridge.range = 5;
  bridge.includedOnlyMeshes = meshes.filter((m) =>
    /GEO-(deck|equipment-control|equipment-bridge)/.test(m.name),
  );

  // Shadow receivers and physical occluders are separate sets. A fixture in an
  // adjacent room can block a light without receiving that light itself.
  const proxyMaterial = new StandardMaterial("ship-occlusion-opaque", scene);
  proxyMaterial.disableLighting = true;
  proxyMaterial.transparencyMode = Material.MATERIAL_OPAQUE;
  proxyMaterial.backFaceCulling = false;
  const proxies: AbstractMesh[] = [];
  const proxySources = new Map<AbstractMesh, AbstractMesh>();
  const occluders: AbstractMesh[] = [];
  for (const mesh of meshes) {
    if (!mesh.getTotalVertices() || mesh.metadata?.hullDecal || mesh.metadata?.shadowExcluded) continue;
    const structural = isStructuralShadowSource(mesh);
    if (structural) {
      // Sibling clone shares immutable geometry, not its visibility or material.
      const proxy = mesh.clone(
        "shadow-occluder-" + mesh.name,
        mesh.parent,
        true,
      );
      if (!proxy) continue;
      proxy.metadata = {...mesh.metadata, role: 'proxy', shadowRole: mesh.metadata.role};
      proxy.material = proxyMaterial;
      proxy.layerMask = 0x10000000;
      proxy.setEnabled(true);
      proxy.isVisible = true;
      proxy.visibility = 1;
      proxy.isPickable = false;
      proxy.receiveShadows = false;
      proxySources.set(proxy, mesh);
      proxies.push(proxy);
      occluders.push(proxy);
      exteriorShadows.removeShadowCaster(mesh, false);
      exteriorShadows.addShadowCaster(proxy, false);
    } else if (
      !mesh.material ||
      (!mesh.material.needAlphaBlendingForMesh(mesh) &&
        !mesh.material.needAlphaTestingForMesh(mesh))
    ) {
      occluders.push(mesh);
    }
  }
  // Seven fixed 256px spot maps remain present in both views. Removing a map
  // while retaining its direct light would make solid partitions transparent.
  const spots = [...roomLights.map((entry) => entry.light), bridge];
  const cabinShadows = spots.map((light) => {
    // Camera zoom must not clip metre-scale casters or dilute depth bias.
    light.shadowMinZ = 0.05;
    light.shadowMaxZ = light.range;
    const shadow = steppedShadow(light, 256);
    shadow.setDarkness(0);
    shadow.getShadowMap()!.refreshRate =
      RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    return shadow;
  });
  const receiverLights = [
    ...roomLights.map((entry) => entry.light),
    ...accents,
    bridge,
  ];
  let cabinVisible = true;
  let budgetManaged = false;
  let budgetLightingAllowed = true;
  const localEligible = (light:Light) => cabinVisible && budgetLightingAllowed && root.isEnabled() && !light.isDisposed()
    && light.intensity > 0 && light.includedOnlyMeshes.some(mesh => !mesh.isDisposed() && mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0);
  const localSources = receiverLights.map(light => ({
    light,
    id: `${root.metadata?.shipId ?? root.name}:local:${light.name}`,
    apply: ({enabled,shadowEnabled}:Parameters<ManagedLocalLight['apply']>[0]) => {
      if(light.isDisposed())return;
      const next = enabled && localEligible(light);
      const shadow = light.getShadowGenerator();
      const nextShadow = next && shadowEnabled && !!shadow;
      // A cached map may have changed while its light was suppressed. Ensure
      // first reactivation sees current actor/geometry occlusion.
      if(nextShadow && (!light.isEnabled(false) || !light.shadowEnabled))shadow?.getShadowMap()?.resetRefreshCounter();
      if(light.isEnabled(false)!==next)light.setEnabled(next);
      if(light.shadowEnabled!==nextShadow)light.shadowEnabled=nextShadow;
    },
  }));
  const exteriorCasters = [
    ...(exteriorShadows.getShadowMap()!.renderList ?? []),
  ];
  const sunBatches = createShadowBatches(root);
  const sunPlacementCache = createShadowPlacementCache(root);
  const spotBatches = spots.map(() => createShadowBatches(root));
  const refreshExteriorBatches = () => {
    exteriorShadows.getShadowMap()!.renderList = sunBatches.rebuild(
      exteriorCasters.filter(mesh => !mesh.isDisposed() && (cabinVisible || !isCabinMesh(mesh.name))),
    );
  };
  function setMembership(
    light: Light,
    key: "includedOnlyMeshes" | "excludedMeshes",
    next: AbstractMesh[],
  ) {
    const current = light[key];
    if (
      current.length === next.length &&
      current.every((mesh, index) => mesh === next[index])
    )
      return;
    light[key] = next;
  }
  function syncReceiverLights() {
    for (const light of receiverLights) {
      setMembership(
        light,
        "includedOnlyMeshes",
        light.includedOnlyMeshes.filter((mesh) => !mesh.isDisposed()),
      );
      // Babylon interprets an empty inclusion list as unrestricted, not empty.
      const enabled = localEligible(light);
      if (!budgetManaged && light.isEnabled(false) !== enabled) light.setEnabled(enabled);
    }
  }
  syncReceiverLights();
  const actorMeshes: AbstractMesh[] = [];
  function pruneDisposedActors() {
    for (let i = actorMeshes.length - 1; i >= 0; i--)
      if (actorMeshes[i].isDisposed()) actorMeshes.splice(i, 1);
    for (const light of [sun, ...receiverLights]) {
      setMembership(
        light,
        "includedOnlyMeshes",
        light.includedOnlyMeshes.filter((mesh) => !mesh.isDisposed()),
      );
      setMembership(
        light,
        "excludedMeshes",
        light.excludedMeshes.filter((mesh) => !mesh.isDisposed()),
      );
    }
    for (const shadow of [exteriorShadows, ...cabinShadows]) {
      const map = shadow.getShadowMap();
      if (map?.renderList?.some((mesh) => mesh.isDisposed()))
        map.renderList = map.renderList.filter((mesh) => !mesh.isDisposed());
    }
    syncReceiverLights();
  }
  function addActor(next: AbstractMesh[]) {
    pruneDisposedActors();
    for (const mesh of next) {
      if (mesh.isDisposed() || actorMeshes.includes(mesh)) continue;
      actorMeshes.push(mesh);
      mesh.receiveShadows = true;
      sun.excludedMeshes.push(mesh);
      if (mesh.material && "maxSimultaneousLights" in mesh.material)
        mesh.material.maxSimultaneousLights = 8;
    }
  }
  // Cache signatures contain only placement transforms below the common ship root.
  // Rigid ship translation/yaw therefore cannot invalidate local spot depth maps.
  const placementCache = createShadowPlacementCache(root);
  let geometryRevision = 0;
  const geometryObservers = new Map<
    Geometry,
    {
      previous: Geometry["onGeometryUpdated"];
      observer: Geometry["onGeometryUpdated"];
    }
  >();
  let staticLists: AbstractMesh[][] = spots.map(() => []);
  let previousActors = spots.map(() => "");
  function refreshShadowCache(localX: number, localY: number) {
    for (const [proxy, source] of proxySources) {
      if (source.isDisposed()) {
        proxy.dispose(false, false);
        proxySources.delete(proxy);
        continue;
      }
      if (
        proxy instanceof Mesh &&
        source instanceof Mesh &&
        source.geometry &&
        proxy.geometry !== source.geometry
      )
        source.geometry.applyToMesh(proxy);
      proxy.position.copyFrom(source.position);
      proxy.scaling.copyFrom(source.scaling);
      if (source.rotationQuaternion)
        proxy.rotationQuaternion = source.rotationQuaternion.clone();
      else {
        proxy.rotationQuaternion = null;
        proxy.rotation.copyFrom(source.rotation);
      }
      proxy.parent = source.parent;
    }
    const liveOccluders = occluders.filter((mesh) => !mesh.isDisposed());
    for (const mesh of liveOccluders) {
      if (
        mesh instanceof Mesh &&
        mesh.geometry &&
        !geometryObservers.has(mesh.geometry)
      ) {
        const geometry = mesh.geometry,
          previous = geometry.onGeometryUpdated;
        const observer: Geometry["onGeometryUpdated"] = (updated, kind) => {
          previous?.(updated, kind);
          geometryRevision++;
        };
        geometry.onGeometryUpdated = observer;
        geometryObservers.set(geometry, { previous, observer });
      }
    }
    const dirty = placementCache.update(liveOccluders, geometryRevision);
    if (dirty) {
      refreshExteriorBatches();
      root.computeWorldMatrix(true);
      const inverse = Matrix.Invert(root.getWorldMatrix());
      staticLists = spots.map((light, i) =>
        spotBatches[i].rebuild(liveOccluders.filter((mesh) => {
          if (!mesh.isEnabled() || !mesh.isVisible) return false;
          mesh.computeWorldMatrix(true);
          const sphere = mesh.getBoundingInfo().boundingSphere;
          return sphereIntersectsSpot(
            Vector3.TransformCoordinates(sphere.centerWorld, inverse),
            sphere.radiusWorld,
            light.position,
            light.direction,
            light.range,
            light.angle,
          );
        })),
      );
    }
    const alive = actorMeshes.filter(
      (mesh) => !mesh.isDisposed() && mesh.isEnabled(),
    );
    const actorCenter = new Vector3(localX, 1.2, -localY);
    const dynamic = spots
      .map((light, i) => ({
        i,
        distance: Vector3.Distance(light.position, actorCenter),
      }))
      .filter(({ i }) =>
        sphereIntersectsSpot(
          actorCenter,
          1.5,
          spots[i].position,
          spots[i].direction,
          spots[i].range,
          spots[i].angle,
        ),
      )
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2)
      .map((entry) => entry.i);
    for (let i = 0; i < spots.length; i++) {
      const actors = dynamic.includes(i) ? alive : [];
      const actorKey = actors.map((mesh) => mesh.uniqueId).join(",");
      const map = cabinShadows[i].getShadowMap()!;
      if (dirty || actorKey !== previousActors[i])
        map.renderList = [...staticLists[i], ...actors];
      // Actor pose can change every frame. Other five spot maps reuse their depth.
      if (dirty || actors.length || actorKey !== previousActors[i])
        map.resetRefreshCounter();
      previousActors[i] = actorKey;
    }
  }
  function update(_interiorBlend: number, localX: number, localY: number) {
    if (!cabinVisible) {
      // Parent deck visibility stays live even while local spot maps are paused.
      if (sunPlacementCache.update(exteriorCasters, geometryRevision)) refreshExteriorBatches();
      return;
    }
    pruneDisposedActors();
    const nearest = roomLights
      .map(({ room }, i) => ({
        i,
        d: Math.hypot(room.x - localX, room.y - localY),
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .map((n) => n.i);
    const alive = actorMeshes.filter((mesh) => !mesh.isDisposed());
    for (let i = 0; i < roomLights.length; i++) {
      const { room, light } = roomLights[i];
      const receives = nearest.includes(i);
      const doorVisible =
        receives &&
        cabinLineOfSight(Math.sign(room.x) * 1.4, room.y, localX, localY);
      for (const [source, allowed] of [
        [light, receives],
        [accents[i], doorVisible],
      ] as const) {
        const base = source.includedOnlyMeshes.filter(
          (m) => !m.isDisposed() && !actorMeshes.includes(m),
        );
        setMembership(
          source,
          "includedOnlyMeshes",
          allowed ? [...base, ...alive] : base,
        );
        setMembership(source, "excludedMeshes", allowed ? [] : [...alive]);
      }
    }
    const bridgeVisible = cabinLineOfSight(0, 7.2, localX, localY);
    const bridgeBase = bridge.includedOnlyMeshes.filter(
      (m) => !m.isDisposed() && !actorMeshes.includes(m),
    );
    setMembership(
      bridge,
      "includedOnlyMeshes",
      bridgeVisible ? [...bridgeBase, ...alive] : bridgeBase,
    );
    setMembership(bridge, "excludedMeshes", bridgeVisible ? [] : [...alive]);
    syncReceiverLights();
    refreshShadowCache(localX, localY);
  }
  refreshShadowCache(0, 0);
  scene.onDisposeObservable.addOnce(() => {
    sunBatches.dispose();
    sunPlacementCache.clear();
    for (const batches of spotBatches) batches.dispose();
    placementCache.clear();
    for (const [geometry, { previous, observer }] of geometryObservers)
      if (geometry.onGeometryUpdated === observer)
        geometry.onGeometryUpdated = previous;
    for (const proxy of proxies) proxy.dispose(false, false);
    proxyMaterial.dispose();
  });

  return {
    addActor,
    setCabinVisible(visible: boolean) {
      if (visible === cabinVisible) return;
      cabinVisible = visible;
      refreshExteriorBatches();
      syncReceiverLights();
    },
    update,
    primaryLight: sun,
    /** Sun/fill are separate; local positions use the current renderer frame. */
    getLocalLightSources(allowed=true):ManagedLocalLight[]{
      budgetManaged=true;budgetLightingAllowed=allowed;
      const world=root.computeWorldMatrix(true);
      return localSources.filter(({light})=>!light.isDisposed()).map(({light,id,apply})=>({
        id,position:Vector3.TransformCoordinates(light.position,world),range:light.range,
        eligible:localEligible(light),requiresShadow:spots.includes(light as SpotLight),
        shadowEligible:!!light.getShadowGenerator()?.getShadowMap(),apply,
      }));
    },
  };
}

function steppedShadow(light: DirectionalLight | SpotLight, size: number) {
  const shadow = new ShadowGenerator(size, light);
  shadow.filter = ShadowGenerator.FILTER_NONE;
  shadow.getShadowMap()?.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);
  shadow.bias = 0.001;
  shadow.normalBias = 0.025;
  shadow.setDarkness(0.1);
  return shadow;
}
