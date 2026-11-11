import { PerspectiveCamera } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import "./demo.css";
import { HoloCard } from "./HoloCard";
import {
  CARD_COUNT,
  CARD_H,
  CARD_W,
  layoutCard,
  makeCardTexture,
  placeholderPerson,
} from "./placeholders";
import {
  TRANSITION_HOLD_MS,
  TransitionController,
  useCardSlot,
  useTubeRig,
  type TransitionPhase,
} from "./Transition";

const PHASE_LABEL: Record<TransitionPhase, string> = {
  idle: "Đang xoay",
  enter: "Bay vào",
  hold: "Giữ thẻ",
  exit: "Bay về",
};

const HUD_SPACE = 136;

function fitScale() {
  const width = Math.max(1, window.innerWidth - 24);
  const height = Math.max(1, window.innerHeight - HUD_SPACE);
  return Math.min(width / 1080, height / 1920);
}

function readConfig() {
  const params = new URLSearchParams(window.location.search);
  const auto = params.get("auto") === "1";
  const raw = params.get("hold");
  let holdMs: number | undefined = auto ? 7500 : 4000;
  if (raw === "default") holdMs = undefined;
  else if (raw !== null && Number.isFinite(Number(raw))) holdMs = Math.max(0, Number(raw));
  return { auto, holdMs };
}

function CameraAim() {
  const camera = useThree((state) => state.camera);
  useLayoutEffect(() => {
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

function CardPlane({
  index,
  geometry,
  material,
  onPick,
}: {
  index: number;
  geometry: THREE.PlaneGeometry;
  material: THREE.MeshBasicMaterial;
  onPick: (index: number) => void;
}) {
  const bind = useCardSlot(index);
  const ref = useRef<THREE.Mesh>(null);
  const layout = useMemo(() => layoutCard(index), [index]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.position.copy(layout.position);
    mesh.quaternion.copy(layout.quaternion);
    mesh.scale.set(1, 1, 1);
    bind(mesh);
    return () => bind(null);
  }, [bind, layout]);

  return (
    <mesh
      ref={ref}
      geometry={geometry}
      material={material}
      onClick={(event) => {
        event.stopPropagation();
        onPick(index);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    />
  );
}

function Tube({ onPick }: { onPick: (index: number) => void }) {
  const bindTube = useTubeRig();
  const geometry = useMemo(() => new THREE.PlaneGeometry(CARD_W, CARD_H), []);
  const materials = useMemo(
    () =>
      Array.from({ length: CARD_COUNT }, (_, index) => {
        const map = makeCardTexture(index);
        return new THREE.MeshBasicMaterial({
          map,
          transparent: true,
          opacity: 1,
          depthWrite: true,
          toneMapped: false,
          side: THREE.DoubleSide,
        });
      }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      for (const material of materials) {
        material.map?.dispose();
        material.dispose();
      }
    },
    [geometry, materials],
  );

  return (
    <group ref={bindTube}>
      {materials.map((material, index) => (
        <CardPlane key={index} index={index} geometry={geometry} material={material} onPick={onPick} />
      ))}
    </group>
  );
}

function Scene({
  activeIndex,
  holdMs,
  onDone,
  onPhaseChange,
  onPick,
}: {
  activeIndex: number | null;
  holdMs: number | undefined;
  onDone: () => void;
  onPhaseChange: (phase: TransitionPhase) => void;
  onPick: (index: number) => void;
}) {
  return (
    <>
      <PerspectiveCamera makeDefault fov={36} near={0.1} far={80} position={[0, 0, 8.7]} />
      <CameraAim />
      <TransitionController activeIndex={activeIndex} onDone={onDone} onPhaseChange={onPhaseChange} holdMs={holdMs}>
        <Tube onPick={onPick} />
      </TransitionController>
    </>
  );
}

function Demo() {
  const config = useMemo(() => readConfig(), []);
  const [scale, setScale] = useState(fitScale);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [shown, setShown] = useState(0);
  const [phase, setPhase] = useState<TransitionPhase>("idle");
  const [done, setDone] = useState(0);
  const arm = useRef(0);
  const cursor = useRef(0);
  const person = placeholderPerson(shown);

  const pick = useCallback((index: number) => {
    window.clearTimeout(arm.current);
    setShown(index);
    setActiveIndex(null);
    arm.current = window.setTimeout(() => setActiveIndex(index), 50);
  }, []);

  const stop = useCallback(() => {
    window.clearTimeout(arm.current);
    setActiveIndex(null);
  }, []);

  const next = useCallback(() => {
    const index = cursor.current % CARD_COUNT;
    cursor.current += 1;
    pick(index);
  }, [pick]);

  useEffect(() => () => window.clearTimeout(arm.current), []);

  useEffect(() => {
    const fit = () => setScale(fitScale());
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    if (!config.auto) return;
    let n = 0;
    const fire = () => {
      const index = n % CARD_COUNT;
      n += 1;
      cursor.current = n;
      pick(index);
    };
    let interval = 0;
    const start = window.setTimeout(() => {
      fire();
      interval = window.setInterval(fire, 12_000);
    }, 1200);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(interval);
    };
  }, [config.auto, pick]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("button")) return;
      if (event.key === "Escape") stop();
      if (event.key === " " || event.key === "ArrowRight") {
        event.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, stop]);

  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    [],
  );

  const holdLabel = config.holdMs === undefined ? `${TRANSITION_HOLD_MS} (mặc định)` : String(config.holdMs);

  return (
    <div className="viewport" data-phase={phase} data-done={done} data-auto={config.auto ? "1" : "0"} data-card={shown}>
      <div className="fit" style={{ width: 1080 * scale, height: 1920 * scale }}>
        <div className="stage">
          <div className="webgl">
            <Canvas
              dpr={[1, 1.5]}
              frameloop="always"
              gl={{
                antialias: false,
                alpha: true,
                stencil: false,
                powerPreference: "high-performance",
                premultipliedAlpha: false,
              }}
              onCreated={({ gl }) => {
                gl.setClearColor(0x000000, 0);
                gl.outputColorSpace = THREE.SRGBColorSpace;
                gl.toneMapping = THREE.NoToneMapping;
              }}
            >
              <Scene
                activeIndex={activeIndex}
                holdMs={config.holdMs}
                onDone={() => setDone((count) => count + 1)}
                onPhaseChange={setPhase}
                onPick={pick}
              />
            </Canvas>
          </div>
          {/* Zoom keeps the 1080×1920 overlay aligned without scaling the WebGL canvas. */}
          <div className="holo-fit" style={{ zoom: scale }}>
            <HoloCard
              active={phase === "hold"}
              years={person.years}
              name={person.name}
              department={person.department}
            />
          </div>
        </div>
      </div>
      <div className="hud">
        <p>Ảnh và chữ là placeholder. Không có ảnh người hay dữ liệu thật.</p>
        <button type="button" onClick={next}>
          Thẻ tiếp
        </button>
        <button type="button" onClick={stop}>
          Dừng
        </button>
        <span className="phase" data-phase-label={phase}>
          {PHASE_LABEL[phase]}
        </span>
        <span className="phase">Giữ {holdLabel} ms</span>
        {config.auto ? <span className="phase">Tự chạy mỗi 12 giây</span> : null}
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(<Demo />);
