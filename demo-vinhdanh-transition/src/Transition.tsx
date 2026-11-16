import { useThree, useFrame } from "@react-three/fiber";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as THREE from "three";

/**
 * Flies one card plane out of a rotating tube to the camera, holds, then returns it.
 *
 * Render inside `<Canvas>`. Bind the rotating parent with `useTubeRig()` and each
 * card mesh with `useCardSlot(index)`. The controller is the only writer of the
 * group's `rotation.y` and, during a cycle, of each card's local transform.
 *
 * A cycle starts when `activeIndex` changes to a number other than the last
 * finished index. After `holdMs` the motion reverses and `onDone` fires.
 * Set `activeIndex` to `null` to return early. Set `null`, then the same number,
 * to replay a card.
 *
 * Card materials should allow `opacity` (they are faded, not cloned). Meshes are
 * reused in place — nothing is spawned for the flight.
 */

export const TRANSITION_FLY_MS = 1200;
export const TRANSITION_HOLD_MS = 45_000;

const BRAKE_MS = 280;
const RELEASE_MS = 320;
const REDUCED_FLY_MS = 240;
const HERO_HEIGHT_FRACTION = 1395 / 1920;
const LIFT = 0.6;
const RECED_DEPTH = 2.15;
const RECED_OUT = 0.5;
const RECED_SCALE = 0.86;
const RECED_OPACITY = 0.08;
const DEFAULT_SPIN = 0.18;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export type TransitionPhase = "idle" | "enter" | "hold" | "exit";

export type TransitionControllerProps = {
  /** Card to present. `null` cancels and returns the active card. */
  activeIndex: number | null;
  /** Called once the card is home and the tube may spin again. */
  onDone?: () => void;
  /** Time the card stays in front of the camera. Default 45000. */
  holdMs?: number;
  /** Radians per second while the tube is idling. Default 0.18. */
  spinSpeed?: number;
  /** Phase changes only — not every frame. */
  onPhaseChange?: (phase: TransitionPhase) => void;
  children?: ReactNode;
};

type Mode = "idle" | "brake" | "enter" | "hold" | "exit" | "release";

type Rig = {
  mesh: THREE.Mesh;
  homePos: THREE.Vector3;
  homeQuat: THREE.Quaternion;
  homeScale: THREE.Vector3;
};

type MatSnap = { opacity: number; depthWrite: boolean; transparent: boolean };

type Store = {
  rigs: Map<number, Rig>;
  tube: THREE.Group | null;
  spin: number;
  spinSpeed: number;
  speedMul: number;
  brakeFrom: number;
  mode: Mode;
  modeStart: number;
  pose: number;
  running: number | null;
  lastDone: number | null;
  requested: number | null;
  holdMs: number;
  onDone?: () => void;
  onPhaseChange?: (phase: TransitionPhase) => void;
  phase: TransitionPhase;
  reduced: boolean;
  targetReady: boolean;
  captureMisses: number;
  warned: boolean;
  targetPos: THREE.Vector3;
  targetQuat: THREE.Quaternion;
  targetScale: THREE.Vector3;
  awayLocal: THREE.Vector3;
  localUp: THREE.Vector3;
  listeners: Set<(phase: TransitionPhase) => void>;
  matSnaps: WeakMap<THREE.Material, MatSnap>;
  scratch: {
    q: THREE.Quaternion;
    qFlip: THREE.Quaternion;
    camPos: THREE.Vector3;
    camQuat: THREE.Quaternion;
    forward: THREE.Vector3;
    camUp: THREE.Vector3;
    center: THREE.Vector3;
    targetWorld: THREE.Vector3;
    zAxis: THREE.Vector3;
    xAxis: THREE.Vector3;
    yAxis: THREE.Vector3;
    basis: THREE.Matrix4;
    worldQuat: THREE.Quaternion;
    parentQuat: THREE.Quaternion;
    parentScale: THREE.Vector3;
    localPos: THREE.Vector3;
    out: THREE.Vector3;
  };
};

const Ctx = createContext<Store | null>(null);

function useTransitionStore() {
  const store = useContext(Ctx);
  if (!store) {
    throw new Error("Transition hooks must be used inside <TransitionController>.");
  }
  return store;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function easeInOutCubic(value: number) {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function normalizeIndex(value: number | null) {
  if (value === null || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function cleanHold(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return TRANSITION_HOLD_MS;
  return Math.max(0, value);
}

function reducedNow() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function createStore(): Store {
  const reduced = reducedNow();
  return {
    rigs: new Map(),
    tube: null,
    spin: 0,
    spinSpeed: DEFAULT_SPIN,
    speedMul: reduced ? 0 : 1,
    brakeFrom: 1,
    mode: "idle",
    modeStart: 0,
    pose: 0,
    running: null,
    lastDone: null,
    requested: null,
    holdMs: TRANSITION_HOLD_MS,
    phase: "idle",
    reduced,
    targetReady: false,
    captureMisses: 0,
    warned: false,
    targetPos: new THREE.Vector3(),
    targetQuat: new THREE.Quaternion(),
    targetScale: new THREE.Vector3(1, 1, 1),
    awayLocal: new THREE.Vector3(0, 0, -1),
    localUp: new THREE.Vector3(0, 1, 0),
    listeners: new Set(),
    matSnaps: new WeakMap(),
    scratch: {
      q: new THREE.Quaternion(),
      qFlip: new THREE.Quaternion(),
      camPos: new THREE.Vector3(),
      camQuat: new THREE.Quaternion(),
      forward: new THREE.Vector3(),
      camUp: new THREE.Vector3(),
      center: new THREE.Vector3(),
      targetWorld: new THREE.Vector3(),
      zAxis: new THREE.Vector3(),
      xAxis: new THREE.Vector3(),
      yAxis: new THREE.Vector3(),
      basis: new THREE.Matrix4(),
      worldQuat: new THREE.Quaternion(),
      parentQuat: new THREE.Quaternion(),
      parentScale: new THREE.Vector3(),
      localPos: new THREE.Vector3(),
      out: new THREE.Vector3(),
    },
  };
}

function setPhase(store: Store, phase: TransitionPhase) {
  if (store.phase === phase) return;
  store.phase = phase;
  try {
    store.onPhaseChange?.(phase);
  } catch (error) {
    console.error(error);
  }
  for (const listener of store.listeners) {
    try {
      listener(phase);
    } catch (error) {
      console.error(error);
    }
  }
}

function emitDone(store: Store) {
  const fn = store.onDone;
  if (!fn) return;
  try {
    fn();
  } catch (error) {
    console.error(error);
  }
}

function applyOpacity(store: Store, material: THREE.Material, opacity: number) {
  if (!("opacity" in material)) return;
  const mat = material as THREE.MeshBasicMaterial;
  let snap = store.matSnaps.get(mat);
  if (!snap) {
    snap = { opacity: mat.opacity, depthWrite: mat.depthWrite, transparent: mat.transparent };
    store.matSnaps.set(mat, snap);
  }
  if (!mat.transparent) {
    mat.transparent = true;
    mat.needsUpdate = true;
  }
  mat.opacity = opacity;
  mat.depthWrite = opacity >= 0.98;
}

function setOpacity(store: Store, mesh: THREE.Mesh, opacity: number) {
  const material = mesh.material;
  if (Array.isArray(material)) {
    for (let i = 0; i < material.length; i += 1) applyOpacity(store, material[i], opacity);
    return;
  }
  if (material) applyOpacity(store, material, opacity);
}

function restoreMaterial(store: Store, mesh: THREE.Mesh) {
  const material = mesh.material;
  const list = Array.isArray(material) ? material : material ? [material] : [];
  for (let i = 0; i < list.length; i += 1) {
    const mat = list[i];
    const snap = store.matSnaps.get(mat);
    if (!snap || !("opacity" in mat)) continue;
    const basic = mat as THREE.MeshBasicMaterial;
    const wasTransparent = basic.transparent;
    basic.opacity = snap.opacity;
    basic.depthWrite = snap.depthWrite;
    basic.transparent = snap.transparent;
    if (wasTransparent !== snap.transparent) basic.needsUpdate = true;
  }
}

function parkRig(store: Store, rig: Rig) {
  rig.mesh.position.copy(rig.homePos);
  rig.mesh.quaternion.copy(rig.homeQuat);
  rig.mesh.scale.copy(rig.homeScale);
  rig.mesh.renderOrder = 0;
  restoreMaterial(store, rig.mesh);
}

function parkAll(store: Store) {
  for (const rig of store.rigs.values()) parkRig(store, rig);
}

function recaptureHomes(store: Store) {
  for (const rig of store.rigs.values()) {
    rig.homePos.copy(rig.mesh.position);
    rig.homeQuat.copy(rig.mesh.quaternion).normalize();
    rig.homeScale.copy(rig.mesh.scale);
  }
}

function applyPose(store: Store, pose: number) {
  const eased = easeInOutCubic(pose);
  const active = store.running;
  const lift = Math.sin(Math.PI * eased) * LIFT;
  for (const [index, rig] of store.rigs) {
    const mesh = rig.mesh;
    if (index === active && store.targetReady) {
      mesh.position.lerpVectors(rig.homePos, store.targetPos, eased);
      mesh.position.addScaledVector(store.localUp, lift);
      mesh.scale.lerpVectors(rig.homeScale, store.targetScale, eased);
      if (eased <= 0) {
        mesh.quaternion.copy(rig.homeQuat);
      } else if (eased >= 1) {
        mesh.quaternion.copy(store.targetQuat);
      } else if (store.reduced) {
        mesh.quaternion.copy(rig.homeQuat).slerp(store.targetQuat, eased);
      } else {
        // One full turn around the card's Y so the flight reads as a flip
        // and still ends face-on to the camera.
        store.scratch.q.copy(rig.homeQuat).slerp(store.targetQuat, eased);
        store.scratch.qFlip.setFromAxisAngle(Y_AXIS, Math.PI * 2 * eased);
        store.scratch.q.multiply(store.scratch.qFlip);
        mesh.quaternion.copy(store.scratch.q);
      }
      setOpacity(store, mesh, 1);
      mesh.renderOrder = 10;
      continue;
    }
    mesh.position.copy(rig.homePos);
    mesh.position.addScaledVector(store.awayLocal, RECED_DEPTH * eased);
    store.scratch.out.copy(rig.homePos);
    if (store.scratch.out.lengthSq() > 1e-8) {
      mesh.position.addScaledVector(store.scratch.out.normalize(), RECED_OUT * eased);
    }
    const shrink = 1 - (1 - RECED_SCALE) * eased;
    mesh.scale.copy(rig.homeScale).multiplyScalar(shrink);
    mesh.quaternion.copy(rig.homeQuat);
    setOpacity(store, mesh, 1 - (1 - RECED_OPACITY) * eased);
    mesh.renderOrder = 0;
  }
}

function captureTarget(store: Store, camera: THREE.Camera) {
  const rig = store.running === null ? undefined : store.rigs.get(store.running);
  const parent = rig?.mesh.parent;
  if (!rig || !parent) return false;
  if (!(camera as THREE.PerspectiveCamera).isPerspectiveCamera) return false;
  const persp = camera as THREE.PerspectiveCamera;
  if (!(persp.fov > 0)) return false;

  parent.updateWorldMatrix(true, false);
  camera.updateMatrixWorld();
  const sc = store.scratch;
  camera.getWorldPosition(sc.camPos);
  camera.getWorldDirection(sc.forward);
  camera.getWorldQuaternion(sc.camQuat);
  if (store.tube) store.tube.getWorldPosition(sc.center);
  else sc.center.set(0, 0, 0);

  const distCenter = Math.max(sc.camPos.distanceTo(sc.center), persp.near + 2);
  const distance = THREE.MathUtils.clamp(
    distCenter * 0.5,
    persp.near + 1.2,
    Math.max(persp.near + 1.2, distCenter - 0.35),
  );
  sc.targetWorld.copy(sc.camPos).addScaledVector(sc.forward, distance);

  sc.camUp.set(0, 1, 0).applyQuaternion(sc.camQuat);
  sc.zAxis.copy(sc.forward).negate();
  sc.xAxis.crossVectors(sc.camUp, sc.zAxis);
  if (sc.xAxis.lengthSq() < 1e-8) sc.xAxis.set(1, 0, 0);
  sc.xAxis.normalize();
  sc.yAxis.crossVectors(sc.zAxis, sc.xAxis).normalize();
  sc.basis.makeBasis(sc.xAxis, sc.yAxis, sc.zAxis);
  sc.worldQuat.setFromRotationMatrix(sc.basis);
  parent.getWorldQuaternion(sc.parentQuat);
  store.targetQuat.copy(sc.parentQuat).invert().multiply(sc.worldQuat).normalize();
  sc.localPos.copy(sc.targetWorld);
  parent.worldToLocal(sc.localPos);
  store.targetPos.copy(sc.localPos);

  store.localUp.set(0, 1, 0);
  parent.getWorldQuaternion(sc.parentQuat);
  store.localUp.applyQuaternion(sc.parentQuat.invert());

  store.awayLocal.copy(sc.forward);
  parent.getWorldQuaternion(sc.parentQuat);
  store.awayLocal.applyQuaternion(sc.parentQuat.invert()).normalize();

  const geometry = rig.mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const baseH = box ? Math.max(1e-4, box.max.y - box.min.y) : 1;
  parent.getWorldScale(sc.parentScale);
  const parentY = Math.max(1e-4, Math.abs(sc.parentScale.y));
  const visibleH = 2 * Math.tan(THREE.MathUtils.degToRad(persp.fov) / 2) * distance;
  const wantH = visibleH * HERO_HEIGHT_FRACTION;
  const meshScaleY = wantH / (baseH * parentY);
  const hy = Math.abs(rig.homeScale.y) || 1;
  const hx = Math.abs(rig.homeScale.x) || hy;
  const signX = rig.homeScale.x < 0 ? -1 : 1;
  const signY = rig.homeScale.y < 0 ? -1 : 1;
  store.targetScale.set(signX * meshScaleY * (hx / hy), signY * meshScaleY, rig.homeScale.z || 1);
  store.targetReady = true;
  store.captureMisses = 0;
  return true;
}

function beginBrake(store: Store, index: number, now: number) {
  recaptureHomes(store);
  store.running = index;
  store.pose = 0;
  store.targetReady = false;
  store.captureMisses = 0;
  store.modeStart = now;
  setPhase(store, "enter");
  if (store.reduced || store.speedMul <= 0.02) {
    store.speedMul = 0;
    store.mode = "enter";
    return;
  }
  store.brakeFrom = store.speedMul;
  store.mode = "brake";
}

function beginReturn(store: Store, now: number) {
  if (store.mode === "exit" || store.mode === "release" || store.mode === "idle") return;
  setPhase(store, "exit");
  if (store.pose <= 0.0001 || store.mode === "brake") {
    parkAll(store);
    store.pose = 0;
    store.mode = "release";
    store.modeStart = now;
    return;
  }
  store.mode = "exit";
  store.modeStart = now;
}

function finishCycle(store: Store, now: number) {
  const finished = store.running;
  store.running = null;
  store.targetReady = false;
  store.captureMisses = 0;
  store.lastDone = finished;
  const next = store.requested;
  if (next !== null && next !== finished && store.rigs.has(next)) {
    emitDone(store);
    beginBrake(store, next, now);
    return;
  }
  store.mode = "idle";
  store.speedMul = store.reduced ? 0 : 1;
  setPhase(store, "idle");
  emitDone(store);
}

function step(store: Store, camera: THREE.Camera, rawDt: number) {
  const now = performance.now();
  const dt = Math.min(Math.max(rawDt || 0, 0), 0.05);
  if (!store.reduced && store.speedMul > 0) {
    store.spin += store.spinSpeed * store.speedMul * dt;
  }
  if (store.tube) {
    store.tube.rotation.y = store.spin;
    store.tube.updateWorldMatrix(true, false);
  }

  const requested = store.requested;
  if (store.running !== null && !store.rigs.has(store.running) && store.mode !== "idle") {
    parkAll(store);
    store.mode = "idle";
    store.running = null;
    store.targetReady = false;
    store.speedMul = store.reduced ? 0 : 1;
    setPhase(store, "idle");
    emitDone(store);
    return;
  }

  if (store.mode === "idle") {
    if (requested === null) store.lastDone = null;
    else if (requested !== store.lastDone && store.rigs.has(requested)) beginBrake(store, requested, now);
    return;
  }

  if (
    requested !== store.running &&
    (store.mode === "brake" || store.mode === "enter" || store.mode === "hold")
  ) {
    beginReturn(store, now);
  }

  if (store.mode === "brake") {
    const t = clamp01((now - store.modeStart) / BRAKE_MS);
    store.speedMul = store.brakeFrom * (1 - easeInOutCubic(t));
    if (t < 1) return;
    store.speedMul = 0;
    store.mode = "enter";
    store.modeStart = now;
    store.pose = 0;
    store.targetReady = false;
  }

  if (store.mode === "enter") {
    if (!store.targetReady && !captureTarget(store, camera)) {
      store.captureMisses += 1;
      if (!store.warned && store.tube === null) {
        store.warned = true;
        console.warn("TransitionController: bind the rotating group with useTubeRig().");
      }
      if (store.captureMisses > 45) {
        parkAll(store);
        store.mode = "idle";
        store.running = null;
        store.speedMul = store.reduced ? 0 : 1;
        setPhase(store, "idle");
        emitDone(store);
      }
      return;
    }
    const fly = Math.max(16, store.reduced ? REDUCED_FLY_MS : TRANSITION_FLY_MS);
    store.pose = Math.min(1, store.pose + (dt * 1000) / fly);
    applyPose(store, store.pose);
    if (store.pose < 1) return;
    store.pose = 1;
    applyPose(store, 1);
    store.mode = "hold";
    store.modeStart = now;
    setPhase(store, "hold");
    return;
  }

  if (store.mode === "hold") {
    applyPose(store, 1);
    if (now - store.modeStart < store.holdMs) return;
    beginReturn(store, now);
  }

  if (store.mode === "exit") {
    const fly = Math.max(16, store.reduced ? REDUCED_FLY_MS : TRANSITION_FLY_MS);
    store.pose = Math.max(0, store.pose - (dt * 1000) / fly);
    applyPose(store, store.pose);
    if (store.pose > 0) return;
    parkAll(store);
    store.pose = 0;
    store.mode = "release";
    store.modeStart = now;
  }

  if (store.mode === "release") {
    const next = store.requested;
    if (next !== null && next !== store.running && store.rigs.has(next)) {
      finishCycle(store, now);
      return;
    }
    const dur = store.reduced ? 1 : RELEASE_MS;
    const t = clamp01((now - store.modeStart) / dur);
    store.speedMul = store.reduced ? 0 : easeInOutCubic(t);
    if (t < 1) return;
    finishCycle(store, now);
  }
}

function Driver() {
  const store = useTransitionStore();
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      store.reduced = media.matches;
      if (media.matches) store.speedMul = 0;
      else if (store.mode === "idle") store.speedMul = 1;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [store]);
  useFrame((_, delta) => step(store, camera, delta));
  return null;
}

export function TransitionController({
  activeIndex,
  onDone,
  holdMs,
  spinSpeed,
  onPhaseChange,
  children,
}: TransitionControllerProps) {
  const storeRef = useRef<Store | null>(null);
  if (storeRef.current === null) storeRef.current = createStore();
  const store = storeRef.current;
  store.requested = normalizeIndex(activeIndex);
  store.holdMs = cleanHold(holdMs);
  store.spinSpeed = spinSpeed === undefined || !(spinSpeed > 0) ? DEFAULT_SPIN : spinSpeed;
  store.onDone = onDone;
  store.onPhaseChange = onPhaseChange;
  return (
    <Ctx.Provider value={store}>
      {children}
      <Driver />
    </Ctx.Provider>
  );
}

/** Attach to each card plane. `index` is the value passed as `activeIndex`. */
export function useCardSlot(index: number) {
  const store = useTransitionStore();
  return useCallback(
    (mesh: THREE.Mesh | null) => {
      if (!mesh) {
        store.rigs.delete(index);
        return;
      }
      mesh.userData.cardIndex = index;
      store.rigs.set(index, {
        mesh,
        homePos: mesh.position.clone(),
        homeQuat: mesh.quaternion.clone().normalize(),
        homeScale: mesh.scale.clone(),
      });
    },
    [index, store],
  );
}

/**
 * Attach to the group that parents the card meshes.
 * The controller writes `rotation.y` every frame; do not animate that axis yourself.
 */
export function useTubeRig() {
  const store = useTransitionStore();
  return useCallback(
    (group: THREE.Group | null) => {
      store.tube = group;
    },
    [store],
  );
}

/** Subscribe from a component rendered inside the controller. Outside the canvas, use `onPhaseChange`. */
export function useTransitionPhase(): TransitionPhase {
  const store = useTransitionStore();
  const [phase, setPhaseState] = useState<TransitionPhase>(store.phase);
  useEffect(() => {
    setPhaseState(store.phase);
    const listener = (next: TransitionPhase) => setPhaseState(next);
    store.listeners.add(listener);
    return () => {
      store.listeners.delete(listener);
    };
  }, [store]);
  return phase;
}
