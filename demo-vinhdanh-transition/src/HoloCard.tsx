import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import "./HoloCard.css";

const COUNT_MS = 800;
const CONFETTI_MS = 2000;
const COLORS = ["#ffffff", "#ffe08a", "#7ad7ff", "#ff4b9a", "#fff6fb", "#ffb15a"];

export type HoloCardProps = {
  /** Final tenure. Counts up from 0 in 0.8s while `active`. */
  years: number;
  name?: string;
  department?: string;
  /** Present the card (tilt, shine, count-up, a 2s confetti burst). */
  active?: boolean;
  /** Use a newline for a second line. */
  greeting?: string;
};

const CUBES = [
  { className: "c1", color: "#ffd36b" },
  { className: "c2", color: "#ff6fa5" },
  { className: "c3", color: "#7ad7ff" },
  { className: "c4", color: "#ffb3d1" },
  { className: "c5", color: "#ff8a5b" },
] as const;

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return reduced;
}

function makeBits(seed: number) {
  let state = (seed * 9973 + 17) >>> 0;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return Array.from({ length: 34 }, (_, id) => {
    const angle = rand() * Math.PI * 2;
    const dist = 160 + rand() * 560;
    return {
      id,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist * 0.92,
      rot: `${Math.round(rand() * 640 - 320)}deg`,
      delay: `${(rand() * 0.1).toFixed(3)}s`,
      duration: `${(1.15 + rand() * 0.75).toFixed(3)}s`,
      color: COLORS[id % COLORS.length],
      w: 8 + Math.floor(rand() * 8),
      h: 12 + Math.floor(rand() * 10),
      radius: rand() > 0.72 ? "999px" : "2px",
    };
  });
}

function Burst({ seed }: { seed: number }) {
  const bits = useMemo(() => makeBits(seed), [seed]);
  return (
    <div className="confetti" aria-hidden="true" data-confetti="1">
      {bits.map((bit) => (
        <i
          key={bit.id}
          style={{
            background: bit.color,
            width: bit.w,
            height: bit.h,
            borderRadius: bit.radius,
            animationDelay: bit.delay,
            animationDuration: bit.duration,
            "--dx": `${bit.dx}px`,
            "--dy": `${bit.dy}px`,
            "--turn": bit.rot,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

/**
 * Portrait overlay for the vinh danh kiosk: 885×1395 card on a 1080×1920 stage.
 * Shine is a reduced pokemon-card foil (pointer glare + slow sweep), with the
 * top-center face region masked out of the light. See simeydotme/pokemon-cards-css.
 */
export function HoloCard({
  years,
  name = "Mẫu",
  department = "Nhóm demo",
  active = false,
  greeting = "Thank you\nfor being you",
}: HoloCardProps) {
  const reduced = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLElement>(null);
  const [burstSeed, setBurstSeed] = useState(0);
  const [showBurst, setShowBurst] = useState(false);
  const targetYears = Math.max(0, Math.round(years));
  const lines = greeting.split("\n");

  useEffect(() => {
    const node = numRef.current;
    if (!node) return;
    if (!active) {
      node.textContent = "0";
      node.dataset.years = "0";
      return;
    }
    if (reduced) {
      node.textContent = String(targetYears);
      node.dataset.years = String(targetYears);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - (1 - t) ** 3;
      const value = t >= 1 ? targetYears : Math.round(eased * targetYears);
      node.textContent = String(value);
      node.dataset.years = String(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, reduced, targetYears]);

  useEffect(() => {
    if (!active || reduced) {
      setShowBurst(false);
      return;
    }
    setBurstSeed((seed) => seed + 1);
    setShowBurst(true);
    const timer = window.setTimeout(() => setShowBurst(false), CONFETTI_MS);
    return () => window.clearTimeout(timer);
  }, [active, reduced]);

  useEffect(() => {
    const sweep = cardRef.current?.querySelector(".sweep");
    if (!(sweep instanceof HTMLElement) || !active || reduced) return;
    sweep.style.animation = "none";
    void sweep.offsetWidth;
    sweep.style.animation = "";
  }, [active, reduced]);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || !active || reduced) return;
    let frame = 0;
    let pointing = false;
    let resumeAt = 0;
    let targetX = 50;
    let targetY = 42;
    let currentX = 50;
    let currentY = 42;

    const lookAt = (clientX: number, clientY: number) => {
      const rect = card.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      targetX = ((clientX - rect.left) / rect.width) * 100;
      targetY = ((clientY - rect.top) / rect.height) * 100;
      pointing = true;
      resumeAt = performance.now() + 1400;
    };
    const onMove = (event: PointerEvent) => lookAt(event.clientX, event.clientY);
    const onLeave = () => {
      pointing = false;
    };

    const loop = (now: number) => {
      if (pointing && now > resumeAt) pointing = false;
      if (!pointing && !document.hidden) {
        const t = now / 1000;
        targetX = 50 + Math.sin(t * 0.45) * 18;
        targetY = 40 + Math.cos(t * 0.33) * 12;
      }
      const follow = pointing ? 0.22 : 0.07;
      currentX += (targetX - currentX) * follow;
      currentY += (targetY - currentY) * follow;
      const dx = (currentX - 50) / 50;
      const dy = (currentY - 42) / 50;
      card.style.setProperty("--mx", `${currentX.toFixed(2)}%`);
      card.style.setProperty("--my", `${currentY.toFixed(2)}%`);
      card.style.setProperty("--rx", `${(dy * -11).toFixed(3)}deg`);
      card.style.setProperty("--ry", `${(dx * 13).toFixed(3)}deg`);
      card.style.setProperty("--bx", `${(50 - (currentX - 50) * 0.85).toFixed(2)}%`);
      card.style.setProperty("--by", `${(50 - (currentY - 50) * 0.85).toFixed(2)}%`);
      frame = requestAnimationFrame(loop);
    };

    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerleave", onLeave);
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      card.removeEventListener("pointermove", onMove);
      card.removeEventListener("pointerleave", onLeave);
    };
  }, [active, reduced]);

  return (
    <div className="holo-stage" data-active={active ? "true" : "false"} data-reduced={reduced ? "true" : "false"}>
      {CUBES.map((cube) => (
        <div key={cube.className} className={`cube-slot ${cube.className}`} style={{ "--cube": cube.color } as CSSProperties} aria-hidden="true">
          <div className="cubelet">
            <i /><i /><i /><i /><i /><i />
          </div>
        </div>
      ))}
      <div className="card-pos">
        <div
          ref={cardRef}
          className="holo-card"
          aria-label={`${name}. ${targetYears} năm cùng MoMo. ${department}`}
        >
          <div className="breathe">
            <div className="surface">
              <div className="face" aria-hidden="true">
                <span className="head" />
                <span className="shoulders" />
                <em>ẢNH</em>
              </div>
              <div className="fx" aria-hidden="true">
                <div className="foil" />
                <div className="glare" />
                <div className="sweep" />
              </div>
              <div className="copy">
                <p className="greeting">
                  {lines.map((line, index) => (
                    <span key={`${index}-${line}`}>
                      {index > 0 ? <br /> : null}
                      {line}
                    </span>
                  ))}
                </p>
                <p className="years">
                  <strong ref={numRef} data-years="0">
                    0
                  </strong>
                  <span>
                    YEARS
                    <br />
                    WITH MOMO
                  </span>
                </p>
                <div className="identity">
                  <h2>{name}</h2>
                  <p className="pill">{department}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showBurst ? <Burst seed={burstSeed} /> : null}
      <p className="wordmark">
        The Power of Small
        <span>placeholder</span>
      </p>
    </div>
  );
}
