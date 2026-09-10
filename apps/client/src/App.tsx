import { GameLoadingScreen } from "./GameLoadingScreen";
import { ShipRefitPanel } from "./ShipRefitPanel";
import { MountedFuelPanel } from "./MountedFuelPanel";
import {
  QUALIFIED_FLIGHT_PREVIEW_SHA256,
  authoredFlightPresentation,
  authoredExhaustTelemetry,
} from "./construction-flight-presentation";
import {
  readCargo,
  usesScopedCargo,
  moveScopedCargo,
  moveCargoBatch,
} from "./scoped-cargo";
import { useSharedWorldEntry } from "./use-shared-world-entry";
import { SharedWorldReview } from "./SharedWorldReview";
import {
  sharedBodyPresentation,
  bodyDestinations,
} from "./shared-body-presentation";
import { constructionInspectionCatalog } from "./construction-inspection";
import { constructionPresentation } from "./construction-presentation";
import { createMovementControl } from "./movement-control";
import { createIntentTransmitter } from "./intent-transmitter";
import { LAB_STORAGE_FIXTURES } from "../../../packages/content/src/storage-fixtures";
import { ConstructionReview } from "./ConstructionReview";
import { PILOT_LAYOUT } from "../../../packages/content/src/pilot-layout";
import { AccountPanel } from "./AccountPanel";
import { createConnectionSession } from "./connection-session";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow-condensed/600.css";
import "./style.css";
import {
  connect,
  createSharedWorldPresentation,
  getSharedWorldBinding,
  type DbConnection,
  type ShipRow,
  type CharacterRow,
  type StationRow,
  type SpaceBodyRow,
  type ActuatorOutputRow,
} from "@sidereal/net";
import { SPACE_VISTAS, DEFAULT_SPACE_VISTA } from "@sidereal/content";
import {
  LAB_FLIGHT_ACTUATORS,
  LAB_FLIGHT_MASS,
} from "../../../packages/content/src/flight";
import { LAB_BODIES } from "../../../packages/content/src/space";
import { LAB_INTERACTIONS } from "../../../packages/content/src/interactions";
import { inventoryView, inventoryAppearance } from "./inventory";
import { createCombatInput } from "./combat-input";
import { createOperationId } from "./operation-id";
import { INVENTORY_DEFINITIONS } from "../../../packages/content/src/inventory";
import {
  objectDetails,
  loadInspectionCatalog,
  interactionAction,
  interactionLabel,
  type EquipmentCatalog,
} from "./objects";
import type { CrewAppearance } from "../../../packages/render/src/crew/appearance";
import type { SceneState } from "../../../packages/render/src";
import {
  createGameUI,
  gameplayIntent,
  type GameUIState,
} from "../../../packages/canvas-ui/src";
export default function App({
  auth,
  accountName = "Development character",
  onSignOut = () => {},
}: {
  auth?: { token: string; kind: "oidc" };
  accountName?: string;
  onSignOut?: () => void;
}) {
  const [sharedReview] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.has("sharedWorldReview") && !params.has("constructionReview");
  });
  const [sharedEnabled] = useState(true);
  const [sharedPresentation] = useState(() => createSharedWorldPresentation());
  const sharedAdmission = useSyncExternalStore(
    (listener) =>
      sharedPresentation.store.subscribeTable("admission", listener),
    () => sharedPresentation.store.getTableSnapshot("admission"),
  )[0];
  const localShipId = useRef<string | undefined>(undefined);
  const [selectedObject, setSelectedObject] = useState<string>();
  const [combatEnabled, setCombatEnabled] = useState(false);
  const [equipmentCatalog, setEquipmentCatalog] = useState<EquipmentCatalog>();
  const appearanceWrites = useRef(Promise.resolve());
  const [rendererFailed, setRendererFailed] = useState(false);
  const [status, setStatus] = useState("connecting"),
    [error, setError] = useState("");
  const [revision, refresh] = useState(0),
    [interior, setInterior] = useState(true);
  const [vistaId, setVistaId] = useState(
    () => localStorage.getItem("sidereal.vista") ?? DEFAULT_SPACE_VISTA,
  );
  const [reducedMotion, setReducedMotion] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [loadedSceneKey, setLoadedSceneKey] = useState<string>();
  const [loadStage, setLoadStage] = useState("connecting");
  const [loadFailure, setLoadFailure] = useState<string>();
  const loadingRef = useRef(true);
  const [modelStatus, setModelStatus] = useState("Loading vessel"),
    [pending, setPending] = useState(false);
  const connection = useRef<DbConnection | null>(null);
  const movementControl = useRef<ReturnType<
    typeof createMovementControl<DbConnection>
  > | null>(null);
  useEffect(() => {
    const control = createMovementControl<DbConnection>({
      claim: (c) => c.reducers.claimInputControl({}),
      release: (c) =>
        c.isActive ? c.reducers.releaseInputControl({}) : Promise.resolve(),
      onError: (e) => setError(String(e)),
    });
    movementControl.current = control;
    return () => {
      control.dispose();
      movementControl.current = null;
    };
  }, []);
  const session = useRef<ReturnType<
    typeof createConnectionSession<DbConnection>
  > | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<Awaited<
    ReturnType<(typeof import("@sidereal/render"))["createWorld"]>
  > | null>(null);
  const gui = useRef<ReturnType<typeof createGameUI> | null>(null);
  const sceneState = useRef<SceneState>({
    vx: 0,
    vy: 0,
    actuatorOutputs: [] as ActuatorOutputRow[],
    heading: 0,
    x: 0,
    y: 0,
    localX: 0,
    localY: PILOT_LAYOUT.station.y,
    interior: false,
    inspect: false,
    grid: false,
    seated: false,
    sprinting: false,
    vistaId,
    reducedMotion,
    bodies: [] as SpaceBodyRow[],
  });
  useEffect(() => {
    const active = createConnectionSession(
      connect,
      (c) => {
        connection.current = c;
        sharedPresentation.select(
          sharedEnabled ? getSharedWorldBinding(c)?.store : undefined,
        );
      },
      (s, e) => {
        setStatus(s);
        if (e) setError(e);
        else if (s === "ready")
          setError((previous) =>
            previous.startsWith("Account connection ") ||
            previous === "Reconnecting to your account…"
              ? ""
              : previous,
          );
      },
      () => refresh((v) => v + 1),
      auth,
    );
    session.current = active;
    return () => {
      session.current = null;
      active.dispose();
      // Detach the old socket. Fast Refresh can re-run this effect while keeping
      // its state object; permanently disposing that object would hide all contacts.
      sharedPresentation.select(undefined);
    };
  }, []);
  useEffect(() => {
    session.current?.authenticate(auth);
  }, [auth?.token]);
  const c = connection.current;
  const ownedActors = c ? [...c.db.ownCharacters.iter()] : [];
  const actor = (
    sharedAdmission
      ? ownedActors.find((row) => row.id === sharedAdmission.characterId)
      : ownedActors.length === 1
        ? ownedActors[0]
        : undefined
  ) as CharacterRow | undefined;
  const ship = (
    c && actor
      ? [...c.db.ownShips.iter()].find((row) => row.id === actor.shipId)
      : undefined
  ) as ShipRow | undefined;
  localShipId.current = ship?.id;
  const sharedBinding = sharedEnabled ? getSharedWorldBinding(c) : undefined;
  const sharedEntry = useSharedWorldEntry(c, sharedEnabled);
  const sharedEntryActions = useRef(sharedEntry);
  sharedEntryActions.current = sharedEntry;
  const navigationBodies =
    sharedEnabled && sharedAdmission
      ? sharedBodyPresentation(
          sharedPresentation.store,
          performance.now(),
          false,
        )
      : c
        ? [...c.db.ownSpaceBodies.iter()]
        : [];
  const gameShipAccess =
    c && actor
      ? [...c.db.ownGameShipAccess.iter()].find(
          (row) => row.characterId === actor.id && row.shipId === actor.shipId,
        )
      : undefined;
  const constructionScene = constructionPresentation(
    actor?.id,
    c ? [...c.db.ownConstructionLocation.iter()] : [],
    c ? [...c.db.ownConstructionInstances.iter()] : [],
    c ? [...c.db.ownConstructionStairWalks.iter()] : [],
    c ? [...c.db.ownConstructionStairEgressGeometry.iter()] : [],
  );
  const constructionVisit = constructionScene.visit;
  const constructionInstance = constructionScene.instance;
  const refitAttachmentKey = JSON.stringify(
    c && constructionVisit
      ? [...c.db.ownWayfarerRefitAttachments.iter()]
          .filter(
            (a) =>
              a.instanceId === constructionVisit.instanceId &&
              a.deckId === constructionVisit.deckId,
          )
          .map(({ revision, containerId, ...visual }) => visual)
          .sort((a, b) => a.id.localeCompare(b.id))
      : [],
  );
  const refitAttachments = useMemo(
    () =>
      JSON.parse(
        refitAttachmentKey,
      ) as import("@sidereal/render/construction-refit-attachments").RefitAttachmentVisual[],
    [refitAttachmentKey],
  );
  const sceneDocument = useRef({
    json: undefined as string | undefined,
    version: 0,
  });
  if (sceneDocument.current.json !== constructionInstance?.documentJson) {
    sceneDocument.current = {
      json: constructionInstance?.documentJson,
      version: sceneDocument.current.version + 1,
    };
  }
  const sceneKey = JSON.stringify([
    // Token renewal replaces the socket, not the account or accepted geometry.
    // Rebuilding here would download/compile the whole ship on every refresh.
    c?.identity?.toHexString(),
    constructionInstance?.id,
    sceneDocument.current.version,
    constructionVisit?.visitId,
    refitAttachmentKey,
    constructionScene.egress?.proofHash,
    constructionScene.egress?.stairId,
    gameShipAccess?.shipId,
  ]);
  loadingRef.current = loadedSceneKey !== sceneKey || status !== "ready";
  const authoredFlight = authoredFlightPresentation(
    actor,
    constructionVisit,
    !!constructionInstance,
    c ? [...c.db.ownWorldAdmission.iter()] : [],
    c ? [...c.db.ownAuthoredFlights.iter()] : [],
    ship,
  );
  const staticConstruction =
    constructionScene.active && !authoredFlight.admitted;
  const displayedOutputs = readyForOutputs();
  function readyForOutputs() {
    const outputs =
      c && actor?.connected && ship
        ? [...c.db.ownActuatorOutputs.iter()].filter(
            (row) => row.shipId === ship.id,
          )
        : [];
    return constructionScene.active
      ? authoredFlight.admitted && ship && c
        ? authoredExhaustTelemetry(
            ship.id,
            [...c.db.ownAuthoredFlightFittings.iter()],
            outputs,
          )
        : []
      : outputs;
  }

  const inspectionCatalog = useMemo(
    () =>
      constructionScene.active
        ? constructionInspectionCatalog(
            equipmentCatalog,
            constructionInstance?.documentJson,
            refitAttachments,
            constructionVisit?.deckId,
          )
        : equipmentCatalog,
    [
      equipmentCatalog,
      constructionScene.active,
      constructionInstance?.documentJson,
      refitAttachments,
      constructionVisit?.deckId,
    ],
  );
  const station = (
    c && ship
      ? [...c.db.ownStations.iter()].find((row) => row.shipId === ship.id)
      : undefined
  ) as StationRow | undefined;
  const seated = Boolean(
      actor &&
      (station?.occupantId === actor.id ||
        (constructionVisit &&
          authoredFlight.status &&
          authoredFlight.status.seatState !== "none")),
    ),
    ready = status === "ready";
  const inventory = inventoryView(c, ready && !!actor?.connected);
  const appearanceRow =
    c && ready ? [...c.db.ownAppearance.iter()][0] : undefined;
  const cosmetics: CrewAppearance = appearanceRow
    ? JSON.parse(appearanceRow.appearanceJson)
    : {};
  function saveAppearance(patch: CrewAppearance) {
    // Serialize local clicks; authority still rejects stale revisions from other tabs.
    appearanceWrites.current = appearanceWrites.current
      .then(async () => {
        const db = connection.current;
        if (!db?.isActive)
          throw new Error("Reconnect before changing appearance.");
        const row = [...db.db.ownAppearance.iter()][0];
        if (!row) throw new Error("Character appearance is not ready.");
        await db.reducers.setCharacterAppearance({
          appearanceJson: JSON.stringify({
            ...JSON.parse(row.appearanceJson),
            ...patch,
          }),
          expectedRevision: row.revision,
          operationId: createOperationId(),
        });
      })
      .catch((error) => setError(String(error)));
  }
  const combat =
    c && ready && actor?.connected ? [...c.db.ownCombat.iter()][0] : undefined;
  const interactions =
    ready && actor?.connected && c ? [...c.db.ownInteractions.iter()] : [];
  const couch = interactions.find((row) => row.seatedByYou);
  const constructionSeat =
    c && ready && constructionVisit
      ? [...c.db.ownConstructionSeat.iter()].find(
          (row) =>
            row.characterId === actor?.id &&
            row.instanceId === constructionVisit.instanceId &&
            row.deckId === constructionVisit.deckId,
        )
      : undefined;
  const nearStation =
    (!constructionScene.active || authoredFlight.admitted) &&
    !!actor &&
    !!station &&
    actor.shipId === station.shipId &&
    Math.hypot(actor.localX - station.localX, actor.localY - station.localY) <=
      1.8;
  const selectedInteraction = interactions.find(
    (row) =>
      row.placementId === selectedObject &&
      row.reachable &&
      (!row.occupied || row.seatedByYou),
  );
  const nearestInteraction = interactions
    .filter((row) => row.reachable && (!row.occupied || row.seatedByYou))
    .sort(
      (a, b) =>
        Math.hypot(a.localX - actor!.localX, a.localY - actor!.localY) -
        Math.hypot(b.localX - actor!.localX, b.localY - actor!.localY),
    )[0];
  const contextObject =
    couch ??
    (!seated
      ? (selectedInteraction ?? (!nearStation ? nearestInteraction : undefined))
      : undefined);
  const interactionPrompt = contextObject
    ? interactionLabel(contextObject)
    : seated
      ? "Leave control seat"
      : nearStation
        ? "Control seat"
        : undefined;
  useEffect(() => {
    const abort = new AbortController();
    loadInspectionCatalog(abort.signal)
      .then((catalog) => {
        if (!abort.signal.aborted) setEquipmentCatalog(catalog);
      })
      .catch((error) => {
        if (!abort.signal.aborted) setError(String(error));
      });
    return () => abort.abort();
  }, []);
  const admittedBodyKeys = new Set(
    c ? [...c.db.ownSpaceBodies.iter()].map((body) => body.key) : [],
  );
  const needsCelestialCatalog =
    LAB_BODIES.some(
      (body) => body.kind !== "asteroid" && !admittedBodyKeys.has(body.key),
    ) || interactions.length === 0;
  const requestedCatalog = useRef("");
  useEffect(() => {
    if (
      !actor?.connected ||
      !ready ||
      !needsCelestialCatalog ||
      !!sharedAdmission ||
      !!gameShipAccess ||
      requestedCatalog.current === actor.id
    )
      return;
    requestedCatalog.current = actor.id;
    // Request the server's idempotent lab seeding path. Client never submits
    // body positions or rows, and existing UUIDs/momentum remain untouched.
    c?.reducers.enterLab({ name: actor.name }).catch((e) => {
      requestedCatalog.current = "";
      setError(String(e));
    });
  }, [
    actor?.id,
    actor?.connected,
    ready,
    needsCelestialCatalog,
    gameShipAccess?.shipId,
    sharedAdmission?.shipId,
  ]);
  useEffect(() => {
    localStorage.setItem("sidereal.vista", vistaId);
  }, [vistaId]);
  useEffect(() => {
    if (actor && ready && !actor.connected)
      c?.reducers
        .enterLab({ name: actor.name })
        .catch((e) => setError(String(e)));
  }, [actor?.connected, actor?.id, ready, c]);
  const uiState: GameUIState = {
    accountKind: auth?.kind === "oidc" ? "oidc" : "development",
    sharedEntry: sharedEnabled ? sharedEntry.state : undefined,
    characterAppearance: cosmetics,
    graphics: view.current?.getGraphicsSettings(),
    localLightLimit: view.current?.getLocalLightBudget().limit,
    combat: {
      enabled: combatEnabled,
      active: !!combat?.aimActive,
      weaponName:
        INVENTORY_DEFINITIONS.find((d) => d.id === combat?.weaponDefinitionId)
          ?.name ?? "Equip a weapon",
      energy: combat?.energy ?? 0,
      capacity: combat?.capacity ?? 0,
      shotCost: combat?.shotCost ?? 0,
    },
    resting: !!couch || !!constructionSeat,
    objectDetails: objectDetails(
      selectedObject,
      inspectionCatalog,
      interactions,
      actor,
      { seated, near: nearStation, occupied: !!station?.occupantId },
      ready ? displayedOutputs : [],
      inventory.containers,
      c && constructionScene.active
        ? [...c.db.ownAuthoredFlightFittings.iter()]
        : [],
    ),
    interactionPrompt,
    inventory,
    status,
    error,
    modelStatus,
    hasActor: !!actor,
    connected: ready && !!actor?.connected,
    actorName: actor?.name ?? "",
    shipName:
      (gameShipAccess ? ship?.name : constructionInstance?.name) ??
      (constructionScene.egress ? "Stairway / safe exit" : (ship?.name ?? "")),
    seated,
    nearStation,
    interior,
    speed: staticConstruction
      ? 0
      : ship
        ? Math.hypot(ship.vx, ship.vy)
        : undefined,
    heading: ship
      ? ((((ship.heading * 180) / Math.PI) % 360) + 360) % 360
      : undefined,
    mass: !constructionInstance && ship ? LAB_FLIGHT_MASS.massKg : undefined,
    thrust:
      !constructionInstance && ship
        ? LAB_FLIGHT_ACTUATORS.filter((device) =>
            device.id.startsWith("drives-main-"),
          ).reduce(
            (total, device) => total + device.maxThrustN * device.availability,
            0,
          )
        : undefined,
    x: ship?.x,
    y: ship?.y,
    revision: ship?.revision.toString(),
    receipts: c ? [...c.db.ownEditReceipts.iter()].length : 0,
    pending,
    vistaId,
    reducedMotion,
    destinations: bodyDestinations(navigationBodies),
  };
  const live = useRef({
    actor,
    ship,
    ready,
    pending,
    uiState,
    contextObject,
    couch: couch ?? constructionSeat,
    combat,
    combatEnabled,
    constructionInstance,
  });
  live.current = {
    actor,
    ship,
    ready,
    pending,
    uiState,
    contextObject,
    couch: couch ?? constructionSeat,
    combat,
    combatEnabled,
    constructionInstance,
  };
  const actionPending = useRef(false);
  const perform = async (action: () => Promise<unknown>) => {
    if (actionPending.current || !live.current.ready) return;
    actionPending.current = true;
    setPending(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      actionPending.current = false;
      setPending(false);
    }
  };
  useEffect(() => {
    if (!sharedEnabled) return;
    const syncNavigation = () => {
      const admitted = sharedPresentation.store.getSnapshot().admission[0];
      const bodies = admitted
        ? sharedBodyPresentation(
            sharedPresentation.store,
            performance.now(),
            false,
          )
        : connection.current
          ? [...connection.current.db.ownSpaceBodies.iter()]
          : [];
      live.current.uiState = {
        ...live.current.uiState,
        destinations: bodyDestinations(bodies),
      };
      gui.current?.update(live.current.uiState);
    };
    const stops = (["bodyMotion", "bodyDescription", "admission"] as const).map(
      (table) => sharedPresentation.store.subscribeTable(table, syncNavigation),
    );
    syncNavigation();
    return () => {
      for (const stop of stops) stop();
    };
  }, [sharedEnabled, sharedPresentation]);
  const inventoryCommand = () => ({
    expectedRevision: BigInt(live.current.uiState.inventory?.revision ?? "0"),
    operationId:
      crypto.randomUUID?.() ??
      `inventory-${Date.now()}-${Array.from(crypto.getRandomValues(new Uint32Array(2))).join("-")}`,
  });
  const useControlStation = () => {
    const current = connection.current;
    const actorNow = current && [...current.db.ownCharacters.iter()][0];
    if (!current || !actorNow?.connected) return;
    const visit = [...current.db.ownConstructionLocation.iter()].find(
      (row) => row.characterId === actorNow.id,
    );
    if (!visit) return void perform(() => current.reducers.useStation({}));
    const flight = [...current.db.ownAuthoredFlights.iter()].find(
      (row) => row.shipId === actorNow.shipId,
    );
    if (!flight)
      return setError(
        "Activate this authored ship and begin its flight review before piloting.",
      );
    void perform(() =>
      flight.seatState !== "none"
        ? current.reducers.leaveAuthoredPilot({})
        : current.reducers.enterAuthoredPilot({
            stationId: flight.stationId,
            expectedStationRevision: flight.stationRevision,
            operationId: createOperationId(),
          }),
    );
  };
  const objectCommand = (action: string, placementId?: string) => {
    const connectionNow = connection.current;
    if (
      action === "open-storage" &&
      connectionNow &&
      live.current.actor?.connected
    ) {
      const container = [...inventoryView(connectionNow, true).containers].find(
        (container) =>
          container.placementId === placementId && container.kind === "grid",
      );
      if (container) gui.current?.openContainer(container.id);
      return;
    }
    if (
      action === "use-station" &&
      connectionNow &&
      live.current.actor?.connected
    ) {
      useControlStation();
      return;
    }
    const row =
      connectionNow &&
      [...connectionNow.db.ownInteractions.iter()].find(
        (r) => r.placementId === placementId,
      );
    if (!row || !connectionNow || !live.current.actor?.connected) return;
    void perform(() =>
      connectionNow.reducers.interactObject({
        objectId: row.id,
        action,
        expectedRevision: row.revision,
        operationId:
          crypto.randomUUID?.() ??
          `object-${Date.now()}-${Array.from(crypto.getRandomValues(new Uint32Array(2))).join("-")}`,
      }),
    );
  };
  const interact = () => {
    const row = live.current.contextObject;
    if (row) objectCommand(interactionAction(row), row.placementId);
    else if (
      live.current.actor?.connected &&
      (live.current.uiState.seated || live.current.uiState.nearStation)
    )
      useControlStation();
  };
  const issuedKit = useRef("");
  useEffect(() => {
    if (
      !ready ||
      !actor?.connected ||
      inventory.revision !== "0" ||
      !!gameShipAccess ||
      issuedKit.current === actor.id
    )
      return;
    issuedKit.current = actor.id;
    void perform(() => connection.current!.reducers.claimStarterKit({}));
  }, [
    ready,
    actor?.id,
    actor?.connected,
    inventory.revision,
    gameShipAccess?.shipId,
  ]);
  useEffect(() => {
    setLoadFailure(undefined);
    setLoadStage(ready ? "ship" : "connecting");
    if (!ready || (gameShipAccess && !constructionVisit)) return;
    // A visit can arrive before its authorized geometry in another keyed view.
    // Dispose the previous world and wait; never substitute the stock ship or a
    // cached private document after a grant is revoked.
    if (
      constructionScene.active &&
      !constructionScene.construction &&
      !constructionScene.egress
    )
      return;
    let disposed = false;
    const abort = new AbortController();
    const element = canvas.current!;
    import("@sidereal/render")
      .then(async ({ createWorld, loadEquipmentPoseConfiguration }) => {
        if (disposed) return null;
        const equipmentPose = await loadEquipmentPoseConfiguration();
        if (disposed) return null;
        return createWorld(
          element,
          (text) => {
            if (!disposed) {
              setModelStatus(text);
              setLoadedSceneKey(sceneKey);
            }
          },
          {
            signal: abort.signal,
            onLoadStage: (stage) => {
              if (!disposed) setLoadStage(stage);
            },
            equipmentPose,
            sharedWorld: sharedEnabled
              ? {
                  store: sharedPresentation.store,
                  localShipId: () =>
                    sharedPresentation.store.getSnapshot().admission[0]
                      ?.shipId ?? localShipId.current,
                  bodies: (nowMs) =>
                    sharedPresentation.store.getSnapshot().admission.length
                      ? sharedBodyPresentation(sharedPresentation.store, nowMs)
                      : undefined,
                }
              : undefined,
            construction: constructionScene.construction
              ? {
                  ...constructionScene.construction,
                  attachments: refitAttachments,
                }
              : undefined,
            authoredFlightEffects:
              constructionInstance?.blueprintSha256 ===
              QUALIFIED_FLIGHT_PREVIEW_SHA256,
            constructionEgress: constructionScene.egress,
            onScene(scene) {
              if (disposed) return;
              gui.current = createGameUI(
                element,
                scene,
                live.current.uiState,
                {
                  sharedEntry: {
                    join: () => sharedEntryActions.current.join(),
                    review: () => sharedEntryActions.current.review(),
                  },
                  interact,
                  combat: () => setCombatEnabled((v) => !v),
                  objectDetails: {
                    action: (action) =>
                      objectCommand(
                        action,
                        live.current.uiState.objectDetails?.placementId,
                      ),
                    close: () => setSelectedObject(undefined),
                  },
                  view: () => setInterior((v) => !v),
                  station: useControlStation,
                  enter: (name) =>
                    void perform(() =>
                      connection.current!.reducers.enterLab({ name }),
                    ),
                  rename: (name) => {
                    if (live.current.constructionInstance) {
                      setError("Rename the construction template in Shipyard.");
                      return;
                    }
                    const current = live.current.ship;
                    if (current)
                      void perform(() =>
                        connection.current!.reducers.renameShip({
                          shipId: current.id,
                          name,
                          expectedRevision: current.revision,
                          operationId:
                            crypto.randomUUID?.() ??
                            `edit-${Date.now()}-${Array.from(crypto.getRandomValues(new Uint32Array(2))).join("-")}`,
                        }),
                      );
                  },
                  vista: setVistaId,
                  motion: setReducedMotion,
                  camera: () => view.current?.resetCamera(),
                  diagnostics: (enabled) =>
                    view.current?.getDiagnostics(enabled),
                  diagnosticsToggle: (key) =>
                    view.current?.toggleDebugFeature(key),
                  diagnosticsReset: () => view.current?.resetDebugFeatures(),
                  focusDestination: (id) => view.current?.focusBody(id),
                  crew: saveAppearance,
                  graphics: (patch) => {
                    view.current?.setGraphicsSettings(patch);
                    refresh((v) => v + 1);
                  },
                  graphicsReset: () => {
                    view.current?.resetGraphicsSettings();
                    refresh((v) => v + 1);
                  },
                  localLightLimit: (limit) => {
                    view.current?.setLocalLightLimit(limit);
                    refresh((v) => v + 1);
                  },
                  groundItems: () => view.current?.groundItemLabels() ?? [],
                  inventory: {
                    claimKit: () =>
                      void perform(() =>
                        connection.current!.reducers.claimStarterKit({}),
                      ),
                    claimArmory: () =>
                      void perform(() =>
                        connection.current!.reducers.claimCharacterArmory(
                          inventoryCommand(),
                        ),
                      ),
                    moveItem: (input) =>
                      void perform(() =>
                        usesScopedCargo(
                          readCargo(connection.current!),
                          input.itemId,
                          input.containerId,
                        )
                          ? moveScopedCargo(
                              connection.current!,
                              input.itemId,
                              input.containerId,
                              input,
                            )
                          : connection.current!.reducers.moveInventoryItem({
                              ...input,
                              ...inventoryCommand(),
                            }),
                      ),
                    transferItem: (itemId, containerId) =>
                      void perform(() =>
                        usesScopedCargo(
                          readCargo(connection.current!),
                          itemId,
                          containerId,
                        )
                          ? moveScopedCargo(
                              connection.current!,
                              itemId,
                              containerId,
                            )
                          : connection.current!.reducers.transferInventoryItem({
                              itemId,
                              containerId,
                              ...inventoryCommand(),
                            }),
                      ),
                    storeAll: (containerId, destinationId) =>
                      void perform(() =>
                        readCargo(connection.current!).containers.some(
                          (c) => c.id === containerId || c.id === destinationId,
                        )
                          ? moveCargoBatch(
                              connection.current!,
                              containerId,
                              destinationId,
                            )
                          : connection.current!.reducers.storeAllInventoryItems(
                              {
                                containerId,
                                destinationId,
                                ...inventoryCommand(),
                              },
                            ),
                      ),
                    takeAll: (containerId) =>
                      void perform(() =>
                        readCargo(connection.current!).containers.some(
                          (c) => c.id === containerId,
                        )
                          ? moveCargoBatch(connection.current!, containerId, "")
                          : connection.current!.reducers.takeAllInventoryItems({
                              containerId,
                              ...inventoryCommand(),
                            }),
                      ),
                    dropItem: (itemId) =>
                      void perform(() =>
                        connection.current!.reducers.dropInventoryItem({
                          itemId,
                          ...inventoryCommand(),
                        }),
                      ),
                    equipItem: (itemId) =>
                      void perform(() =>
                        connection.current!.reducers.equipInventoryItem({
                          itemId,
                          ...inventoryCommand(),
                        }),
                      ),
                    assignHotbar: (slot, itemId) =>
                      void perform(() =>
                        connection.current!.reducers.assignInventoryHotbar({
                          slot,
                          itemId,
                          ...inventoryCommand(),
                        }),
                      ),
                    activateHotbar: (slot) =>
                      void perform(() =>
                        connection.current!.reducers.activateInventoryHotbar({
                          slot,
                          ...inventoryCommand(),
                        }),
                      ),
                  },
                  dismiss: () => setError(""),
                  retry: () => location.reload(),
                },
                SPACE_VISTAS,
              );
            },
            onPreviewError: (text) => {
              if (!disposed) setError(text);
            },
            blocksCameraInput: () =>
              loadingRef.current || (gui.current?.pointerBlocked() ?? false),
            blocksObjectSelection: () =>
              loadingRef.current || live.current.combatEnabled,
            onObjectSelected: (id) => {
              if (disposed) return;
              if (id?.startsWith("ground:")) {
                void perform(() =>
                  connection.current!.reducers.transferInventoryItem({
                    itemId: id.slice(7),
                    containerId: "",
                    ...inventoryCommand(),
                  }),
                );
                return;
              }
              if (
                id &&
                (LAB_STORAGE_FIXTURES.some(
                  (fixture) => fixture.placementId === id,
                ) ||
                  (connection.current &&
                    inventoryView(connection.current, true).containers.some(
                      (container) =>
                        container.placementId === id &&
                        container.kind === "grid",
                    )))
              ) {
                setSelectedObject(id);
                objectCommand("open-storage", id);
              } else setSelectedObject(id);
            },
            onLoadError: (text) => {
              if (!disposed) {
                setLoadFailure(text);
                setModelStatus("Vessel unavailable");
              }
            },
          },
        );
      })
      .then((result) => {
        if (!result) return;
        if (disposed) result.dispose();
        else {
          view.current = result;
          result.update(sceneState.current);
        }
      })
      .catch((e) => {
        if (disposed) return;
        setError(String(e));
        setLoadFailure(String(e));
        setRendererFailed(true);
      });
    return () => {
      disposed = true;
      abort.abort();
      gui.current?.dispose();
      gui.current = null;
      view.current?.dispose();
      view.current = null;
    };
  }, [
    sceneKey,
    constructionInstance?.id,
    constructionInstance?.documentJson,
    refitAttachmentKey,
    constructionVisit?.visitId,
    constructionScene.egress?.proofHash,
    constructionScene.egress?.stairId,
    gameShipAccess?.shipId,
    ready,
  ]);
  useEffect(() => {
    if (!rendererFailed || !canvas.current) return;
    const element = canvas.current;
    const draw = () => {
      element.width = element.clientWidth;
      element.height = element.clientHeight;
      const ctx = element.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#091a30";
      ctx.fillRect(0, 0, element.width, element.height);
      ctx.fillStyle = "#eff6ff";
      ctx.font = "24px Barlow, sans-serif";
      ctx.fillText(
        "The graphics renderer could not start.",
        24,
        70,
        element.width - 48,
      );
      ctx.font = "16px Barlow, sans-serif";
      ctx.fillText(
        "Enable WebGL, then click here or press Enter to retry.",
        24,
        110,
        element.width - 48,
      );
    };
    const retry = () => location.reload();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Enter") retry();
    };
    draw();
    element.addEventListener("click", retry);
    element.addEventListener("keydown", key);
    window.addEventListener("resize", draw);
    return () => {
      element.removeEventListener("click", retry);
      element.removeEventListener("keydown", key);
      window.removeEventListener("resize", draw);
    };
  }, [rendererFailed]);
  useEffect(() => {
    sceneState.current = {
      selectedObject,
      groundItems:
        ready && c && !constructionScene.active
          ? [...c.db.ownGroundItems.iter()]
          : [],
      combat: {
        active: combatEnabled && !!combat?.aimActive,
        angle: combat?.aimAngle ?? 0,
        range: combat?.rangeMeters ?? 60,
        itemId: combat?.weaponItemId,
        shotSequence: combat?.shotSequence,
      },
      constructionDeckId: constructionVisit?.deckId,
      constructionSupportElevation: constructionInstance
        ? constructionVisit?.standingElevationM
        : undefined,
      constructionTraversal:
        constructionScene.acceptedStair ??
        (c && constructionVisit
          ? ([...c.db.ownConstructionTraversals.iter()].find(
              (t) =>
                t.characterId === actor?.id &&
                t.instanceId === constructionVisit.instanceId,
            ) ?? null)
          : null),
      constructionDoors:
        c && constructionVisit
          ? [...c.db.ownConstructionDoors.iter()]
              .filter(
                (d) =>
                  d.instanceId === constructionVisit.instanceId &&
                  d.deckId === constructionVisit.deckId,
              )
              .map((d) => {
                const seal = [
                  ...c.db.ownConstructionNativePressure.iter(),
                ].find((p) => p.doorId === d.id);
                return {
                  openingId: d.id,
                  fraction: d.fraction,
                  sealRetraction:
                    seal?.sealRetraction ??
                    (() => {
                      const airlock = [...c.db.ownNativeAirlocks.iter()].find(
                        (a) =>
                          a.id === constructionVisit.instanceId &&
                          a.deckId === constructionVisit.deckId,
                      );
                      return airlock?.innerDoorId === d.id
                        ? airlock.innerSealRetraction
                        : airlock?.outerDoorId === d.id
                          ? airlock.outerSealRetraction
                          : undefined;
                    })(),
                };
              })
          : [],
      objectLights: constructionScene.active
        ? interactions
            .filter((row) => row.kind === "light")
            .map((row) => ({
              placementId: row.placementId,
              enabled: row.enabled,
            }))
        : LAB_INTERACTIONS.filter((row) => row.kind === "light").map(
            ({ placementId }) => ({
              placementId,
              enabled:
                interactions.find((row) => row.placementId === placementId)
                  ?.enabled ?? false,
            }),
          ),
      ...inventoryAppearance(inventory, cosmetics),
      vx: staticConstruction ? 0 : (ship?.vx ?? 0),
      vy: staticConstruction ? 0 : (ship?.vy ?? 0),
      actuatorOutputs: ready ? displayedOutputs : [],
      heading: staticConstruction ? 0 : (ship?.heading ?? 0),
      x: staticConstruction ? 0 : (ship?.x ?? 0),
      y: staticConstruction ? 0 : (ship?.y ?? 0),
      localX: actor?.localX ?? 0,
      localY: actor?.localY ?? PILOT_LAYOUT.station.y,
      interior,
      inspect: false,
      grid: false,
      seated: seated || !!couch || !!constructionSeat,
      seatFacing:
        couch || constructionSeat
          ? (Math.sign((couch ?? constructionSeat)!.localX) * Math.PI) / 2
          : 0,
      sprinting: actor?.sprinting ?? false,
      vistaId,
      reducedMotion,
      bodies: !staticConstruction ? navigationBodies : [],
    };
    view.current?.update(sceneState.current);
    gui.current?.update(uiState);
  }, [
    revision,
    interior,
    seated,
    vistaId,
    reducedMotion,
    status,
    error,
    modelStatus,
    pending,
    cosmetics,
    selectedObject,
    equipmentCatalog,
    combatEnabled,
  ]);
  useEffect(() => {
    const keys = new Set<string>();
    const transmitter = createIntentTransmitter<DbConnection>({
      now: () => performance.now(),
      send: (c, intent) => {
        const control = movementControl.current;
        if (!control?.canSend(c)) return Promise.resolve();
        return c.reducers.setIntent({
          ...intent,
          sequence: control.nextSequence(c),
        });
      },
      onError: (e) => setError(String(e)),
    });
    const send = () => {
      const c = connection.current,
        control = movementControl.current;
      const active =
        !!c?.isActive &&
        !!actor?.connected &&
        ready &&
        document.hasFocus() &&
        !document.hidden;
      control?.activate(active ? c : null);
      if (!active || !c || !control?.canSend(c)) return;
      const blocked =
        loadingRef.current ||
        (gui.current?.blocked() ?? true) ||
        document.hidden ||
        !!live.current.couch;
      if (blocked) keys.clear();
      const intent = gameplayIntent(keys, seated, interior, blocked);
      const walk = view.current?.screenToDeck(
        intent.horizontal,
        intent.vertical,
      ) ?? { dx: 0, dy: 0 };
      transmitter.offer(c, {
        throttle: intent.throttle,
        turn: intent.turn,
        dx: walk.dx,
        dy: walk.dy,
        sprint: intent.sprint,
      });
    };
    const down = (e: KeyboardEvent) => {
      if (
        loadingRef.current ||
        gui.current?.blocked() ||
        !actor?.connected ||
        !ready
      )
        return;
      if (e.code === "Tab") {
        e.preventDefault();
        keys.clear();
        send();
        if (!e.repeat) setInterior((v) => !v);
        return;
      }
      if (e.code === "KeyV" && !e.repeat) {
        e.preventDefault();
        setCombatEnabled((v) => !v);
        return;
      }
      if (e.code === "KeyE" && !e.repeat) {
        e.preventDefault();
        interact();
        return;
      }
      if (
        ["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"].includes(
          e.code,
        )
      ) {
        e.preventDefault();
        keys.add(e.code);
        send();
      }
    };
    const up = (e: KeyboardEvent) => {
      keys.delete(e.code);
      send();
    };
    const blur = () => {
      keys.clear();
      movementControl.current?.activate(null);
    };
    const visibility = () => {
      keys.clear();
      send();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("focus", send);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    const interval = setInterval(send, 50);
    return () => {
      clearInterval(interval);
      keys.clear();
      send();
      window.removeEventListener("keydown", down);
      transmitter.dispose();
      window.removeEventListener("keyup", up);
      window.removeEventListener("focus", send);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [actor?.connected, seated, interior, ready]);
  useEffect(() => {
    const element = canvas.current!;
    let focused = true;
    const input = createCombatInput({
      state: () => {
        const liveState = live.current,
          row = liveState.combat;
        return {
          active: liveState.combatEnabled,
          allowed:
            !!connection.current?.isActive &&
            liveState.ready &&
            !!liveState.actor?.connected &&
            !liveState.uiState.seated &&
            !liveState.couch &&
            liveState.uiState.interior,
          blocked:
            loadingRef.current ||
            !focused ||
            document.hidden ||
            (gui.current?.blocked() ?? true) ||
            (gui.current?.pointerBlocked() ?? true),
          weapon: row?.weaponItemId
            ? {
                itemId: row.weaponItemId,
                revision: row.revision,
                energy: row.energy,
                shotCost: row.shotCost,
                cooldownMs: row.cooldownMs,
              }
            : undefined,
        };
      },
      aim: () => view.current?.aimDirection(),
      sendAim: (active, angle) =>
        connection.current!.reducers.setCombatAim({ active, angle }),
      fire: (itemId, expectedRevision) =>
        connection.current!.reducers.fireWeapon({
          itemId,
          expectedRevision,
          operationId: createOperationId(),
        }),
      error: (error) => setError(String(error)),
    });
    const move = (event: PointerEvent) =>
      view.current?.setAimPointer(event.clientX, event.clientY);
    const down = (event: PointerEvent) => {
      move(event);
      if (
        event.button === 0 &&
        live.current.combatEnabled &&
        !gui.current?.pointerBlocked()
      )
        input.trigger(true);
    };
    const up = (event: PointerEvent) => {
      if (event.button === 0) input.trigger(false);
    };
    const cancel = () => input.cancel();
    const blur = () => {
      focused = false;
      input.cancel();
      void input.tick();
    };
    const focus = () => {
      focused = true;
    };
    const visibility = () => {
      if (document.hidden) blur();
      else focus();
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    const timer = setInterval(() => void input.tick(), 100);
    return () => {
      clearInterval(timer);
      input.dispose();
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return (
    <>
      <div className="game-surface" inert={loadingRef.current}>
        <canvas
          key={rendererFailed ? "fallback" : "webgl"}
          className="game-canvas"
          ref={canvas}
          tabIndex={loadingRef.current ? -1 : 0}
          aria-hidden={loadingRef.current}
          aria-label={
            rendererFailed
              ? "Graphics renderer failed. Enable WebGL, then press Enter to retry."
              : "Sidereal game. WASD moves. Tab changes view. E uses the control seat. Escape opens the console. F6 focuses interface controls."
          }
        />
        <ConstructionReview connection={c} onError={setError} />
        <ShipRefitPanel connection={c} onError={setError} />
        <MountedFuelPanel
          connection={c}
          selectedObject={selectedObject}
          onError={setError}
        />
        {sharedReview && (
          <SharedWorldReview
            connection={c}
            source={sharedBinding?.store}
            readiness={sharedBinding?.readiness}
            onError={setError}
          />
        )}
        <AccountPanel
          connection={c}
          characterId={actor?.id}
          name={accountName}
          oidc={!!auth}
          onSignOut={onSignOut}
        />
      </div>
      {loadingRef.current && (
        <GameLoadingScreen
          stage={status === "ready" ? loadStage : "connecting"}
          shipName={ship?.name ?? ""}
          failure={loadFailure}
          onSignOut={onSignOut}
        />
      )}
    </>
  );
}
