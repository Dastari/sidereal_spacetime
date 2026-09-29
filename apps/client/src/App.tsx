import {
  itemDefinitionOf,
  weaponDefinitionOf,
} from "@sidereal/content/item-presentation";
import type { SpaceRegion } from "@sidereal/sim/space-background";
import { GameLoadingScreen } from "./GameLoadingScreen";
import { ShipSystemsPanel } from "./ShipSystemsPanel";
import {
  authoredFlightPresentation,
  passengerFlightAdmitted,
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
import {
  PREFAB_OBJECT_PREFIX,
  prefabObjectDetails,
  prefabObjectName,
  prefabShipOf,
} from "./prefab-objects";
import { constructionPresentation } from "./construction-presentation";
import { groundItemsForScene } from "./ground-items";
import { createMovementControl } from "./movement-control";
import { createIntentTransmitter } from "./intent-transmitter";
import { LAB_STORAGE_FIXTURES } from "@sidereal/content/storage-fixtures";
import { ConstructionReview, testShipCount } from "./ConstructionReview";
import { PILOT_LAYOUT } from "../../../packages/content/src/pilot-layout";
import { AccountPanel, accountSummary } from "./AccountPanel";
import { createConnectionSession } from "./connection-session";
import React, {
  useCallback,
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
  type CharacterRow,
  type StationRow,
  type SpaceBodyRow,
} from "@sidereal/net";
import { SPACE_VISTAS, DEFAULT_SPACE_VISTA } from "@sidereal/content";
import { LAB_BODIES } from "../../../packages/content/src/space";
import { LAB_INTERACTIONS } from "../../../packages/content/src/interactions";
import { inventoryView, inventoryAppearance } from "./inventory";
import { createCombatInput } from "./combat-input";
import { createOperationId } from "./operation-id";
import { combatNote, trackReload } from "./combat-status";
import {
  objectDetails,
  interactionAction,
  interactionLabel,
  type EquipmentCatalog,
} from "./objects";
import type { CrewAppearance } from "../../../packages/render/src/crew/appearance";
import type { SceneState } from "../../../packages/render/src";
import {
  combatActionsFromView,
  crewmatesFromViews,
  presentationLook,
} from "./crewmates";
import {
  EVA_HELP,
  atOpenHatch,
  buttonDepressurises,
  evaBodiesForScene,
  evaModelOfDocument,
  evaSuitRefusalOf,
  evaThrustFromKeys,
  legacyEntryAction,
  evaHomeVisit,
  evaScene,
  evaStatusLabel,
  localAimAngle,
  logicButtonAction,
  logicDoorStates,
  logicModelOfDocument,
  logicPanelLights,
  worldAimAngle,
} from "./eva";
import {
  createGameUI,
  gameplayIntent,
  isEditableTarget,
  type GameUIState,
  type MenuService,
} from "../../../packages/canvas-ui/src";
/** Shooter feedback labels for structure hits (components use their catalogue name). */
const IMPACT_LABELS: Record<string, string> = {
  character: "Crewmate",
  wall: "Wall",
  glass: "Glass",
  hull: "Hull",
  hatch: "Hatch",
  ship: "Ship hull",
};
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
  /** The DOM service panel opened from the system menu ("" when none). */
  const [servicePanel, setServicePanel] = useState("");
  const servicePanelOpen = useRef("");
  servicePanelOpen.current = servicePanel;
  const closeServicePanel = useCallback(() => setServicePanel(""), []);
  const onSignOutRef = useRef(onSignOut);
  onSignOutRef.current = onSignOut;
  // Legacy stock-ship inspection catalog is retired with its assets (see below).
  const [equipmentCatalog] = useState<EquipmentCatalog>();
  const appearanceWrites = useRef(Promise.resolve());
  const [rendererFailed, setRendererFailed] = useState(false);
  const [status, setStatus] = useState("connecting"),
    [error, setError] = useState("");
  const [revision, refresh] = useState(0),
    [interior, setInterior] = useState(true);
  const [vistaId, setVistaId] = useState(() => DEFAULT_SPACE_VISTA);
  const [reducedMotion, setReducedMotion] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [loadedSceneKey, setLoadedSceneKey] = useState<string>();
  const [loadStage, setLoadStage] = useState("connecting");
  const [loadFailure, setLoadFailure] = useState<string>();
  const loadingRef = useRef(true);
  // HUD-only reload label timing (see combat-status.ts).
  const reloadingUntil = useRef(0);
  const reloadSeen = useRef<bigint | undefined>(undefined);
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
    flightActuators: [],
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
  const systemScape = c
    ? [...c.db.admittedSystemScapes.iter()].find(
        (s) => s.id === sharedAdmission?.systemId,
      )
    : undefined;
  useEffect(() => {
    setVistaId(systemScape?.backgroundId ?? DEFAULT_SPACE_VISTA);
  }, [systemScape?.backgroundId]);
  const activeSpaceRegion: SpaceRegion | undefined = systemScape?.regionsJson
    ? JSON.parse(systemScape.regionsJson)
    : undefined;
  const shipZones =
    c && sharedAdmission
      ? c.db.ownShipZones.shipId.find(sharedAdmission.shipId)
      : undefined;
  const zoneNames: string[] = shipZones
    ? JSON.parse(shipZones.activeJson).map(
        (id: string) =>
          activeSpaceRegion?.zones?.find((z) => z.id === id)?.name ??
          (id === sharedAdmission?.systemId ? "System" : id),
      )
    : [];
  const fieldBodies = () =>
    connection.current
      ? [...connection.current.db.nearbyFieldAsteroids.iter()].map((r) => ({
          id: r.id,
          key: r.id,
          shipId: "",
          kind: "asteroid",
          appearance: "stone",
          x: r.x,
          y: r.y,
          height: r.height,
          radius: r.radius,
          seed: r.seed,
          vx: 0,
          vy: 0,
          heading: 0,
          omega: 0,
          massKg: 0,
          tick: 0n,
        }))
      : [];

  const ownedActors = c ? [...c.db.ownCharacters.iter()] : [];
  const actor = (
    sharedAdmission
      ? ownedActors.find((row) => row.id === sharedAdmission.characterId)
      : ownedActors.length === 1
        ? ownedActors[0]
        : undefined
  ) as CharacterRow | undefined;
  const passengerInterior =
    c && actor
      ? [...c.db.currentPassengerInterior.iter()].find(
          (p) => p.characterId === actor.id && p.shipId === actor.shipId,
        )
      : undefined;
  const passengerVisit =
    c && passengerInterior
      ? [...c.db.ownPassengerVisit.iter()].find(
          (p) =>
            p.characterId === actor?.id &&
            p.shipId === passengerInterior.shipId &&
            p.admitted,
        )
      : undefined;
  const passengerMotion =
    c && passengerVisit
      ? [...c.db.visibleShipMotion.iter()].find(
          (m) => m.shipId === passengerVisit.shipId,
        )
      : undefined;
  const ship =
    c && actor
      ? ([...c.db.ownShips.iter()].find((row) => row.id === actor.shipId) ??
        (passengerInterior && passengerMotion
          ? {
              ...passengerMotion,
              id: passengerInterior.shipId,
              name: passengerInterior.name,
            }
          : undefined))
      : undefined;
  localShipId.current = ship?.id;
  // EVA (wiki Systems/EVA): the own body outside the hull (same plane as the ship).
  const evaBody =
    c && actor
      ? [...c.db.ownEvaBody.iter()].find((r) => r.characterId === actor.id)
      : undefined;
  const evaShipPose = ship
    ? {
        id: ship.id,
        x: ship.x,
        y: ship.y,
        vx: ship.vx,
        vy: ship.vy,
        heading: ship.heading,
        omega: "omega" in ship ? Number(ship.omega) || 0 : 0,
      }
    : undefined;
  /** Authoritative awaiting-ship state: wiped, or created while starter ships
   * are disabled. The character exists with its personal kit but no frame. */
  const awaitingShip = !!actor && actor.shipId === "";
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
  const ownLocations = c ? [...c.db.ownConstructionLocation.iter()] : [];
  // Outside the hull the owner keeps the ship scene: the server's read-only home location.
  const evaHome = ownLocations.some((l) => l.characterId === actor?.id)
    ? undefined
    : evaHomeVisit(evaBody, actor);
  const constructionScene = constructionPresentation(
    actor?.id,
    evaHome ? [...ownLocations, evaHome] : ownLocations,
    c ? [...c.db.ownConstructionInstances.iter()] : [],
    c ? [...c.db.ownConstructionStairWalks.iter()] : [],
    c ? [...c.db.ownConstructionStairEgressGeometry.iter()] : [],
  );
  const constructionVisit = constructionScene.visit;
  const constructionInstance = constructionScene.instance;
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
    constructionScene.egress?.proofHash,
    constructionScene.egress?.stairId,
    gameShipAccess?.shipId,
    awaitingShip,
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
  const passengerAdmitted = passengerFlightAdmitted(
    actor,
    constructionVisit,
    constructionInstance,
    passengerVisit,
    passengerInterior,
    passengerMotion,
  );
  const staticConstruction =
    constructionScene.active && !authoredFlight.admitted && !passengerAdmitted;
  const compiledPhysics =
    c && ship
      ? [...c.db.ownAuthoredFlightPhysics.iter()].find(
          (p) => p.shipId === ship.id,
        )
      : undefined;
  let availableForwardThrust: number | undefined;
  try {
    const envelope = JSON.parse(compiledPhysics?.envelopeJson ?? "null");
    if (
      compiledPhysics?.status === "ready" &&
      Number.isFinite(envelope?.forward)
    )
      availableForwardThrust = compiledPhysics.massKg * envelope.forward;
  } catch {
    /* A rejected definition has no available envelope. */
  }
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

  const evaView =
    evaBody && evaShipPose ? evaScene(evaBody, evaShipPose) : undefined;
  const evaSuitRow =
    c && actor
      ? [...c.db.ownEvaSuit.iter()].find((r) => r.characterId === actor.id)
      : undefined;
  // Ship logic (wiki Systems/Ship Logic): wall buttons, door states and status lights.
  const logicModel = logicModelOfDocument(constructionInstance?.documentJson);
  const logicRows = c ? [...c.db.visibleShipLogic.iter()] : [];
  const logicShipId = constructionInstance?.id;
  const evaAction =
    logicButtonAction({
      shipId: logicShipId,
      logic: logicModel,
      aboard:
        actor && constructionVisit && !evaBody
          ? [actor.localX, actor.localY]
          : undefined,
      outside: evaView?.local ? [evaView.localX, evaView.localY] : undefined,
    }) ??
    legacyEntryAction({
      shipId: logicShipId,
      model: evaModelOfDocument(constructionInstance?.documentJson),
      logic: logicModel,
      outside: evaView ? [evaView.localX, evaView.localY] : undefined,
    });
  const logicDoors = logicDoorStates(logicRows, logicShipId, logicModel);
  const evaNowMicros = BigInt(Math.round(Date.now() * 1000));
  const evaHud = evaBody
    ? {
        label: evaStatusLabel(evaBody, evaShipPose, evaNowMicros, evaSuitRow),
        help: EVA_HELP,
        maglock: false,
        stranded: evaBody.stranded,
        beacon: evaBody.returnEndsMicros > 0n,
      }
    : undefined;
  const evaLocal = !!evaView?.local;
  useEffect(() => {
    // Same plane: next to the loaded ship the deck view continues; far out, the top-down view.
    setInterior(!evaBody || evaLocal);
  }, [!!evaBody, evaLocal]);
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
  // Ship cargo roots are only projected while the server finds the actor within reach of
  // their qualified approach point, so a visible root is an openable crate (E / Interact).
  const reachableStorage =
    ready && actor?.connected && c && !seated
      ? [...c.db.ownReachableCargoContainers.iter()].find(
          (row) =>
            !row.parentItemId && row.kind === "grid" && row.placedObjectId,
        )
      : undefined;
  // Vacuum needs the EVA suit (pressure suit, helmet, jetpack): the server refuses the same.
  const suitRefusal = evaSuitRefusalOf(inventory.items);
  const suitPrompt =
    suitRefusal && !evaBody
      ? (evaAction?.kind === "button" &&
          buttonDepressurises(
            logicModel,
            logicRows,
            logicShipId,
            evaAction.deviceId,
          )) ||
        (actor &&
          constructionVisit &&
          atOpenHatch(
            evaModelOfDocument(constructionInstance?.documentJson),
            logicDoors,
            [actor.localX, actor.localY],
          ))
        ? suitRefusal
        : undefined
      : undefined;
  const interactionPrompt = suitPrompt
    ? suitPrompt
    : evaAction && (evaBody || !contextObject)
      ? evaAction.label
      : contextObject
        ? interactionLabel(contextObject)
        : seated
          ? "Leave control seat"
          : nearStation
            ? "Control seat"
            : reachableStorage
              ? `Open ${reachableStorage.name.toLowerCase()}`
              : undefined;
  // The legacy stock-ship inspection catalog (hull/cargo/equipment manifests,
  // wayfarer.json) belongs to the retired Wayfarer assets that the game client
  // no longer delivers, so it is never fetched.
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
  // Prefab ships: inspect placed objects from the visited document (owner: full stats and live
  // power/throttle; accepted passenger: what is visibly installed only).
  const prefabShip = useMemo(
    () => prefabShipOf(constructionInstance?.documentJson),
    [constructionInstance?.documentJson],
  );
  const ownsCurrentShip =
    !!c &&
    !!actor &&
    [...c.db.ownShips.iter()].some((row) => row.id === actor.shipId);
  const prefabDetails = selectedObject?.startsWith(PREFAB_OBJECT_PREFIX)
    ? prefabObjectDetails(
        selectedObject,
        prefabShip?.doc,
        prefabShip?.catalog,
        ownsCurrentShip
          ? "owner"
          : constructionInstance
            ? "passenger"
            : undefined,
        ownsCurrentShip && c && ship
          ? {
              shipId: ship.id,
              powerFittings: [
                ...c.db.ownAuthoredFlightPowerFittings.iter(),
              ].filter((f) => f.shipId === ship.id),
              throttles: ready ? displayedOutputs : [],
              damage: [...c.db.ownShipComponentDamage.iter()].filter(
                (d) => d.shipId === ship.id,
              ),
            }
          : {},
        actor,
      )
    : undefined;
  const combatImpactRow =
    c && ready && actor?.connected
      ? [...c.db.ownCombatImpact.iter()].find(
          (row) =>
            row.characterId === actor.id &&
            row.shipId === (evaBody ? "" : actor.shipId),
        )
      : undefined;
  // EVA shots end in the world frame; the renderer draws in the own ship's frame.
  const combatImpact =
    combatImpactRow && evaBody && evaShipPose
      ? (() => {
          const c0 = Math.cos(-evaShipPose.heading),
            s0 = Math.sin(-evaShipPose.heading),
            wx = combatImpactRow.x - evaShipPose.x,
            wy = combatImpactRow.y - evaShipPose.y;
          return {
            ...combatImpactRow,
            x: c0 * wx - s0 * wy,
            y: s0 * wx + c0 * wy,
          };
        })()
      : combatImpactRow;
  // The held item (own inventory projection) and this body's latest combat action (reload timing).
  const heldHandheld = itemDefinitionOf(
    inventory.items.find((item) => item.equipmentSlot === "hand"),
  );
  const ownCombatAction =
    c && ready && actor?.connected
      ? [...c.db.visibleCombatActions.iter()].find(
          (row) => row.characterId === actor.id,
        )
      : undefined;
  trackReload(ownCombatAction, reloadingUntil, reloadSeen);
  const ownVitals =
    c && ready && actor?.connected
      ? [...c.db.ownCharacterVitals.iter()].find(
          (row) => row.characterId === actor.id,
        )
      : undefined;
  const lastHit = combatImpact
    ? {
        shotSequence: combatImpact.shotSequence,
        damage: combatImpact.damage,
        kind: combatImpact.kind,
        label:
          (combatImpact.kind === "object"
            ? prefabObjectName(
                prefabShip?.doc,
                prefabShip?.catalog,
                combatImpact.targetId,
              )
            : IMPACT_LABELS[combatImpact.kind]) ?? "Target",
        targetState: combatImpact.targetState,
        targetHp: combatImpact.targetHp,
        targetMaxHp: combatImpact.targetMaxHp,
      }
    : undefined;
  const testShips = passengerVisit ? undefined : testShipCount(c);
  const vesselServices: MenuService[] = awaitingShip
    ? []
    : [
        ...(actor?.shipId
          ? [{ id: "ship-systems", label: "Ship systems" }]
          : []),
        ...(testShips !== undefined
          ? [{ id: "test-ships", label: `Shipyard test ships (${testShips})` }]
          : []),
      ];
  const uiState: GameUIState = {
    accountKind: auth?.kind === "oidc" ? "oidc" : "development",
    account: {
      name: accountName,
      ...accountSummary(c, actor?.id, !!auth),
    },
    vesselServices,
    sharedEntry: sharedEnabled && !awaitingShip ? sharedEntry.state : undefined,
    characterAppearance: cosmetics,
    graphics: view.current?.getGraphicsSettings(),
    antialiasing: view.current?.getAntialiasing(),
    localLightLimit: view.current?.getLocalLightBudget().limit,
    combat: {
      enabled: combatEnabled,
      active: !!combat?.aimActive,
      weaponName:
        itemDefinitionOf(
          combat?.weaponDefinitionId
            ? {
                id: combat.weaponItemId,
                definitionId: combat.weaponDefinitionId,
              }
            : undefined,
        )?.name ??
        heldHandheld?.name ??
        "Equip a weapon",
      note: combatNote(
        combat?.weaponDefinitionId,
        heldHandheld,
        ownCombatAction,
        reloadingUntil.current,
        performance.now(),
        combat?.weaponItemId,
      ),
      energy: combat?.energy ?? 0,
      capacity: combat?.capacity ?? 0,
      shotCost: combat?.shotCost ?? 0,
      lastHit,
    },
    // The server respawns the dead aboard their own ship (owned access), else in place.
    vitals: ownVitals && {
      ...ownVitals,
      respawnAboard: gameShipAccess ? ship?.name : undefined,
    },
    resting: !!couch || !!constructionSeat,
    objectDetails: selectedObject?.startsWith(PREFAB_OBJECT_PREFIX)
      ? prefabDetails
      : objectDetails(
          selectedObject,
          equipmentCatalog,
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
    eva: evaHud,
    inventory,
    status,
    error,
    modelStatus,
    hasActor: !!actor,
    connected: ready && !!actor?.connected,
    actorName: actor?.name ?? "",
    shipName: awaitingShip
      ? "No ship assigned"
      : ((gameShipAccess ? ship?.name : constructionInstance?.name) ??
        (constructionScene.egress
          ? "Stairway / safe exit"
          : (ship?.name ?? ""))),
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
    mass: compiledPhysics?.massKg || undefined,
    thrust: availableForwardThrust,
    x: ship?.x,
    y: ship?.y,
    revision: ship && "revision" in ship ? ship.revision.toString() : undefined,
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
    storageId: reachableStorage?.id,
    evaAction,
    evaPhase: evaView?.phase,
    evaLocal: false,
    evaFrameHeading: 0,
    evaSuitMode: "hold",
    evaBeaconAvailable: false,
    shipHeading: 0,
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
    storageId: reachableStorage?.id,
    evaAction,
    evaPhase: evaView?.phase,
    evaLocal,
    // The body's heading in its current frame (the facing fallback when there is no pointer).
    evaFrameHeading: evaBody
      ? evaLocal
        ? evaBody.localHeading
        : evaBody.heading
      : 0,
    evaSuitMode: evaSuitRow?.mode ?? "hold",
    evaBeaconAvailable:
      !!evaBody && (evaBody.stranded || evaBody.returnEndsMicros > 0n),
    shipHeading: evaShipPose?.heading ?? 0,
  };
  const actionPending = useRef(false);
  /** EVA suit controls last sent (facing throttle) and the local stabiliser toggle. */
  const suitSent = useRef<
    { facing: number; mode: string; active: boolean; at: number } | undefined
  >(undefined);
  const suitMode = useRef<string | undefined>(undefined);
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
    if (!current || !actorNow?.connected || actorNow.shipId === "") return;
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
    const eva = live.current.evaAction;
    const current = connection.current;
    if (
      eva &&
      current &&
      live.current.actor?.connected &&
      (live.current.evaPhase || !row)
    )
      void perform(() =>
        eva.kind === "legacy-entry"
          ? current.reducers.evaCycleAirlock({
              shipId: eva.shipId,
              airlockId: eva.airlockId,
            })
          : current.reducers.pressShipButton({
              shipId: eva.shipId,
              deviceId: eva.deviceId,
            }),
      );
    else if (row) objectCommand(interactionAction(row), row.placementId);
    else if (
      live.current.actor?.connected &&
      (live.current.uiState.seated || live.current.uiState.nearStation)
    )
      useControlStation();
    else if (live.current.storageId)
      gui.current?.openContainer(live.current.storageId);
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
      .then(async ({ createWorld }) => {
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
            sharedWorld: sharedEnabled
              ? {
                  bodies: (nowMs) =>
                    sharedPresentation.store.getSnapshot().admission.length
                      ? [
                          ...sharedBodyPresentation(
                            sharedPresentation.store,
                            nowMs,
                          ),
                          ...fieldBodies(),
                        ]
                      : undefined,
                  // Other players' ships: exterior only, from the accepted visible_ship_* views.
                  ships: {
                    store: sharedPresentation.store,
                    localShipId: () => localShipId.current,
                  },
                }
              : undefined,
            // Without an authorized construction scene the character has no vessel.
            construction: constructionScene.construction,
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
                  openService: setServicePanel,
                  closeService: () => {
                    if (!servicePanelOpen.current) return false;
                    setServicePanel("");
                    return true;
                  },
                  signOut: () => onSignOutRef.current(),
                  objectDetails: {
                    action: (action) =>
                      objectCommand(
                        action,
                        live.current.uiState.objectDetails?.placementId,
                      ),
                    close: () => setSelectedObject(undefined),
                  },
                  view: () => {
                    // No ship: there is no exterior/flight view to switch to.
                    if (live.current.actor?.shipId === "") return;
                    setInterior((v) => !v);
                  },
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
                    if (current && "revision" in current)
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
                  diagnosticsQuality: (patch) =>
                    view.current?.setRenderQuality(patch),
                  focusDestination: (id) => view.current?.focusBody(id),
                  crew: saveAppearance,
                  graphics: (patch) => {
                    view.current?.setGraphicsSettings(patch);
                    refresh((v) => v + 1);
                  },
                  readAntialiasing: () => view.current?.getAntialiasing(),
                  readRenderBackend: () => view.current?.getRenderBackend(),
                  renderBackend: (value) => {
                    view.current?.setRenderBackend(value);
                    refresh((v) => v + 1);
                  },
                  applyRenderBackend: () => {
                    const url = new URL(window.location.href);
                    url.searchParams.delete("rendererFallback");
                    window.location.assign(url);
                  },
                  antialiasing: (patch) => {
                    view.current?.setAntialiasing(patch);
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
                      void perform(async () => {
                        const current = connection.current!;
                        // Equip straight from ship cargo: two separately validated intents,
                        // a scoped transfer into carried storage, then the normal equip.
                        if (
                          readCargo(current).items.some((i) => i.id === itemId)
                        ) {
                          await moveScopedCargo(current, itemId, "");
                          await current.reducers.equipInventoryItem({
                            itemId,
                            ...inventoryCommand(),
                            expectedRevision:
                              [...current.db.ownInventoryState.iter()][0]
                                ?.revision ?? 0n,
                          });
                          return;
                        }
                        await current.reducers.equipInventoryItem({
                          itemId,
                          ...inventoryCommand(),
                        });
                      }),
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
                // The loading screen shows a generic retry; keep the cause diagnosable.
                console.error("Game load failed:", text);
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
          // Development review only: EVA presentation diagnostics (never simulation state).
          if (import.meta.env.DEV) {
            (globalThis as { __siderealEva?: () => unknown }).__siderealEva =
              () => result.getEva();
            // Remote ships and crew as drawn (ids, published hull, LOD tier).
            (
              globalThis as { __siderealSharedWorld?: () => unknown }
            ).__siderealSharedWorld = () => result.getSharedWorldDiagnostics();
          }
        }
      })
      .catch((e) => {
        if (disposed) return;
        setError(String(e));
        setLoadFailure(String(e));
        console.error("Renderer initialization failed", e);
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
        ready && c
          ? groundItemsForScene(
              [...c.db.ownGroundItems.iter()],
              constructionScene,
            )
          : [],
      combat: {
        active: combatEnabled && !!combat?.aimActive,
        angle:
          evaView && evaShipPose
            ? localAimAngle(combat?.aimAngle ?? 0, evaShipPose.heading)
            : (combat?.aimAngle ?? 0),
        range: combat?.rangeMeters ?? 60,
        itemId: combat?.weaponItemId,
        shotSequence: combat?.shotSequence,
        impact: combatImpact
          ? {
              shotSequence: combatImpact.shotSequence,
              x: combatImpact.x,
              y: combatImpact.y,
              kind: combatImpact.kind,
            }
          : undefined,
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
      flightActuators:
        ready && c && ship && authoredFlight.admitted
          ? [...c.db.ownAuthoredFlightActuators.iter()].filter(
              (a) => a.shipId === ship.id,
            )
          : [],
      heading: staticConstruction ? 0 : (ship?.heading ?? 0),
      x: staticConstruction ? 0 : (ship?.x ?? 0),
      y: staticConstruction ? 0 : (ship?.y ?? 0),
      localX: evaView?.localX ?? actor?.localX ?? 0,
      localY: evaView?.localY ?? actor?.localY ?? PILOT_LAYOUT.station.y,
      interior: interior && (!evaView || evaView.local),
      eva: evaView ?? null,
      airlockCycle: null,
      shipLogic: {
        doors: logicDoors,
        panels: logicPanelLights(logicRows, logicShipId),
      },
      evaBodies:
        ready && c && actor?.connected && evaShipPose
          ? evaBodiesForScene(
              c.db.visibleEvaBodies.iter(),
              actor.id,
              evaShipPose,
              presentationLook,
            )
          : [],
      inspect: false,
      grid: false,
      seated: seated || !!couch || !!constructionSeat,
      seatFacing:
        couch || constructionSeat
          ? (Math.sign((couch ?? constructionSeat)!.localX) * Math.PI) / 2
          : 0,
      sprinting: actor?.sprinting ?? false,
      dead: ownVitals?.state === "dead",
      // Other characters on this deck: two server views, never their inventory or health.
      crewmates:
        ready && c && actor?.connected
          ? crewmatesFromViews(
              c.db.currentInteriorCrew.iter(),
              c.db.visibleCrewPresentation.iter(),
              actor.id,
            )
          : [],
      // Accepted combat actions on this deck (own included) drive the r001 weapon effects.
      selfCharacterId: actor?.id,
      combatActions:
        ready && c && actor?.connected
          ? combatActionsFromView(c.db.visibleCombatActions.iter())
          : [],
      vistaId: systemScape ? DEFAULT_SPACE_VISTA : vistaId,
      spaceRegion: activeSpaceRegion,
      reducedMotion,
      bodies: !staticConstruction ? navigationBodies : [],
    };
    view.current?.update(sceneState.current);
    gui.current?.update(uiState);
  }, [
    revision,
    systemScape?.regionsJson,
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
      onStalled: (c) => c.disconnect(),
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
      const evaPhase = live.current.evaPhase;
      if (evaPhase) {
        // Outside the hull (suit IFCS, wiki Systems/EVA): the pointer is the facing the suit
        // turns to through torque; W/S thrust toward/away from it, A/D strafe. Intent only.
        const mode = suitMode.current ?? live.current.evaSuitMode;
        const free = mode === "free";
        // Free (Newtonian) mode: no pointer facing; thrust along the body and A/D spin it.
        const pointer = free ? undefined : view.current?.pointerDirection();
        const aim = pointer
          ? Math.atan2(-pointer[0], pointer[1]) +
            (live.current.evaLocal ? 0 : live.current.shipHeading)
          : undefined;
        const facing = aim !== undefined ? aim : live.current.evaFrameHeading;
        transmitter.offer(
          c,
          evaThrustFromKeys(keys, facing, blocked, free),
          false,
        );
        const now = performance.now();
        const last = suitSent.current;
        const turned =
          !last ||
          Math.abs(
            Math.atan2(
              Math.sin(facing - last.facing),
              Math.cos(facing - last.facing),
            ),
          ) > 0.02;
        if (
          !last ||
          last.mode !== mode ||
          last.active !== (aim !== undefined) ||
          (turned && now - last.at > 100)
        ) {
          suitSent.current = {
            facing,
            mode,
            active: aim !== undefined,
            at: now,
          };
          void c.reducers
            .evaSetSuit({ mode, facing, facingActive: aim !== undefined })
            .catch(() => undefined);
        }
        return;
      }
      suitSent.current = undefined;
      suitMode.current = undefined;
      const intent = gameplayIntent(keys, seated, interior, blocked);
      const walk = view.current?.screenToDeck(
        intent.horizontal,
        intent.vertical,
      ) ?? { dx: 0, dy: 0 };
      transmitter.offer(
        c,
        {
          throttle: intent.throttle,
          turn: intent.turn,
          dx: walk.dx,
          dy: walk.dy,
          sprint: intent.sprint,
        },
        seated,
      );
    };
    const down = (e: KeyboardEvent) => {
      if (
        isEditableTarget(e.target) ||
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
        // No ship: there is no exterior/flight view to switch to. Outside the hull
        // (EVA) the top-down space view is the only view.
        if (
          !e.repeat &&
          live.current.actor?.shipId !== "" &&
          (!live.current.evaPhase || live.current.evaLocal)
        )
          setInterior((v) => !v);
        return;
      }
      if (e.code === "KeyX" && !e.repeat && live.current.evaPhase) {
        // Suit stabiliser: hold (kill rotation and relative drift) or free (pure momentum).
        e.preventDefault();
        suitMode.current =
          (suitMode.current ?? live.current.evaSuitMode) === "free"
            ? "hold"
            : "free";
        send();
        return;
      }
      if (e.code === "KeyB" && !e.repeat && live.current.evaBeaconAvailable) {
        e.preventDefault();
        const current = connection.current;
        if (current)
          void perform(() => current.reducers.evaEmergencyReturn({}));
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
            (liveState.uiState.interior || !!liveState.evaPhase),
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
                capacity: row.capacity,
                canReload: !!weaponDefinitionOf({
                  id: row.weaponItemId,
                  definitionId: row.weaponDefinitionId,
                })?.reloadMs,
                // The view shows a reloading weapon as full; hold fire until it completes.
                reloading: reloadingUntil.current > performance.now(),
              }
            : undefined,
        };
      },
      aim: () => view.current?.aimDirection(),
      sendAim: (active, angle) =>
        connection.current!.reducers.setCombatAim({
          active,
          // EVA aims in the world frame; on deck the aim is ship-local.
          angle: live.current.evaPhase
            ? worldAimAngle(angle, live.current.shipHeading)
            : angle,
        }),
      fire: (itemId, expectedRevision) =>
        connection.current!.reducers.fireWeapon({
          itemId,
          expectedRevision,
          operationId: createOperationId(),
        }),
      reload: (itemId, expectedRevision) =>
        connection.current!.reducers.reloadWeapon({
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
    // R reloads the equipped weapon while in combat (the inventory keeps R for rotation).
    const key = (event: KeyboardEvent) => {
      if (
        event.code === "KeyR" &&
        !event.repeat &&
        live.current.combatEnabled &&
        !gui.current?.blocked()
      )
        void input.reload();
    };
    window.addEventListener("keydown", key);
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
      window.removeEventListener("keydown", key);
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
        {shipZones && (
          <div
            aria-label="Current zones"
            style={{
              position: "absolute",
              top: 16,
              left: "50%",
              transform: "translateX(-50%)",
              color: "#b8ccdc",
              fontSize: 12,
              pointerEvents: "none",
            }}
          >
            {zoneNames.length ? zoneNames.join(" / ") : "Deep space"}
          </div>
        )}
        {!passengerVisit && (
          <ConstructionReview
            connection={c}
            onError={setError}
            open={servicePanel === "test-ships"}
            onClose={closeServicePanel}
          />
        )}
        {passengerInterior && (
          <aside aria-label="Passenger interior" className="passenger-interior">
            <strong>{passengerInterior.name} · Passenger</strong>
            {passengerInterior.flightStatus !== "ready" && (
              <p role="status">
                Flight unavailable: {passengerInterior.flightReason}
              </p>
            )}
            <small>
              {c
                ? [...c.db.currentInteriorCrew.iter()]
                    .filter((p) => p.shipId === passengerInterior.shipId)
                    .map((p) => p.name)
                    .join(", ")
                : ""}
            </small>
          </aside>
        )}
        {!awaitingShip && (
          <>
            <ShipSystemsPanel
              connection={c}
              onError={setError}
              open={servicePanel === "ship-systems"}
              onClose={closeServicePanel}
            />
          </>
        )}
        {awaitingShip && ready && (
          <div
            className="no-ship-notice"
            role="status"
            aria-label="No ship assigned"
          >
            <strong>No ship assigned</strong>
            <span>
              Your character and personal kit are safe. A new ship will be
              assigned to your account.
            </span>
          </div>
        )}
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
          open={servicePanel === "account"}
          onClose={closeServicePanel}
          onSignOut={onSignOut}
        />
      </div>
      {loadingRef.current && (
        <GameLoadingScreen
          stage={status === "ready" ? loadStage : "connecting"}
          shipName={ship?.name ?? ""}
          awaitingShip={awaitingShip}
          failure={loadFailure}
          onSignOut={onSignOut}
        />
      )}
    </>
  );
}
