import { useEffect, useState, type CSSProperties } from "react";
import type { Guest } from "../data/loadGuests.ts";

type Props = {
  guest: Guest;
  variant?: "full" | "tube";
  className?: string;
};

type BitStyle = CSSProperties & {
  "--dx": string;
  "--dy": string;
  "--rot": string;
};

type Bit = {
  id: number;
  style: BitStyle;
};

const BIT_COLORS = ["#F95396", "#FF8FBE", "#FFFFFF", "#F7A0C0", "#FFE4EF"];

function motionOff() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function useYears(target: number, active: boolean) {
  const [shown, setShown] = useState(() => (active && !motionOff() ? 0 : target));

  useEffect(() => {
    if (!active || motionOff()) {
      setShown(target);
      return;
    }

    setShown(0);
    const duration = 800;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(eased * target));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active, target]);

  return shown;
}

function buildBits(): Bit[] {
  const bits: Bit[] = [];
  for (let i = 0; i < 20; i++) {
    const edge = i % 2 === 0;
    const travel = 16 + (i % 6) * 8;
    const size = 7 + (i % 4) * 2;
    bits.push({
      id: i,
      style: {
        left: edge ? `${3 + (i % 4) * 6}%` : `${78 + (i % 4) * 5}%`,
        bottom: `${6 + (i % 7) * 5}%`,
        width: size,
        height: i % 3 === 0 ? Math.round(size * 0.65) : size,
        background: BIT_COLORS[i % BIT_COLORS.length],
        borderRadius: i % 2 === 0 ? "50%" : "2px",
        animationDelay: `${(i % 10) * 0.05}s`,
        animationDuration: `${1.15 + (i % 4) * 0.12}s`,
        "--dx": `${edge ? -travel : travel}px`,
        "--dy": `${i % 3 === 0 ? 12 + (i % 4) * 6 : -(24 + (i % 5) * 12)}px`,
        "--rot": `${(edge ? -1 : 1) * (28 + i * 7)}deg`,
      },
    });
  }
  return bits;
}

function useConfetti(active: boolean) {
  const [bits, setBits] = useState<Bit[]>([]);

  useEffect(() => {
    if (!active || motionOff()) {
      setBits([]);
      return;
    }
    setBits(buildBits());
    const timer = window.setTimeout(() => setBits([]), 2000);
    return () => window.clearTimeout(timer);
  }, [active]);

  return bits;
}

const css = `
.pc {
  --s: calc(885 / 428);
  position: relative;
  width: 885px;
  height: 1395px;
  flex-shrink: 0;
  border-radius: 58px;
  overflow: hidden;
  box-shadow: 0 22px 48px rgba(140, 20, 70, 0.28);
  background-color: #F95396;
  background-image:
    radial-gradient(circle at 50% 38%, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0) 58%),
    linear-gradient(180deg, #FDE6EF 0%, #FED6E6 18%, #F7A0C0 55%, #F95396 100%);
  font-family: "Be Vietnam Pro", sans-serif;
}

.pc--full {
  transform-origin: center center;
  animation:
    pc-breathe 3.2s ease-in-out infinite,
    pc-glow 2.8s ease-in-out infinite;
}

.pc__logo {
  position: absolute;
  left: 33px;
  top: 33px;
  width: 194px;
  height: 64px;
  z-index: 3;
  object-fit: contain;
}

.pc__band {
  position: absolute;
  left: 0;
  top: 110px;
  width: 62px;
  height: 926px;
  z-index: 2;
  object-fit: fill;
}

.pc__tag {
  position: absolute;
  left: 223px;
  top: 50px;
  width: 523px;
  height: 174px;
  z-index: 4;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 42px 86px 36px;
  background-image: url("/figma/tag-frame@2x.png");
  background-size: 100% 100%;
  background-repeat: no-repeat;
  color: #F95396;
  font-family: "Be Vietnam Pro", sans-serif;
  font-weight: 600;
  font-size: 30px;
  line-height: 1.25;
  text-align: center;
}

.pc__photo {
  position: absolute;
  left: 40px;
  top: 220px;
  width: 520px;
  height: 780px;
  z-index: 3;
  object-fit: contain;
}

.pc__stats {
  position: absolute;
  right: 36px;
  top: 320px;
  width: 250px;
  z-index: 4;
  color: #fff;
  text-align: left;
}

.pc__stat-value {
  margin: 0;
  font-family: "Be Vietnam Pro", sans-serif;
  font-weight: 700;
  font-size: 36px;
  line-height: 1.1;
}

.pc__stat-label {
  margin: 0 0 18px;
  font-family: "Be Vietnam Pro", sans-serif;
  font-weight: 600;
  font-size: 18px;
  line-height: 1.2;
  white-space: pre-wrap;
}

.pc__years {
  position: absolute;
  right: 28px;
  bottom: 340px;
  z-index: 5;
  margin: 0;
  font-family: "Paytone One", "Baloo 2", sans-serif;
  font-size: 210px;
  line-height: 0.8;
  color: #F95396;
  -webkit-text-stroke: 10px #fff;
  paint-order: stroke fill;
  filter: drop-shadow(0 6px 8px rgba(160, 20, 70, 0.35));
  pointer-events: none;
}

.pc__podium,
.pc__rubik {
  position: absolute;
  z-index: 4;
  pointer-events: none;
  object-fit: contain;
  object-position: right bottom;
}

.pc__podium {
  right: 0;
  bottom: 310px;
  width: 430px;
  max-height: 280px;
}

.pc__rubik {
  right: 28px;
  bottom: 360px;
  width: 400px;
  max-height: 360px;
}

.pc__cube {
  position: absolute;
  width: 90px;
  height: auto;
  z-index: 4;
  pointer-events: none;
}

.pc__cube-a { right: 440px; bottom: 470px; }
.pc__cube-b { right: 6px; bottom: 520px; }
.pc__cube-c { right: 280px; bottom: 400px; }

.pc--full .pc__rubik {
  transform-origin: center center;
  animation: pc-float-1 4.6s ease-in-out infinite;
}
.pc--full .pc__podium {
  transform-origin: center bottom;
  animation: pc-float-2 5s ease-in-out 0.35s infinite;
}
.pc--full .pc__cube-a {
  transform-origin: center center;
  animation: pc-float-3 3.4s ease-in-out 0.15s infinite;
}
.pc--full .pc__cube-b {
  transform-origin: center center;
  animation: pc-float-4 4.1s ease-in-out 0.7s infinite;
}
.pc--full .pc__cube-c {
  transform-origin: center center;
  animation: pc-float-5 3.8s ease-in-out 1.05s infinite;
}

.pc__footer {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 310px;
  z-index: 6;
  background: #D9D9D9;
}

.pc__name {
  position: absolute;
  left: 48px;
  top: 28px;
  max-width: 620px;
  margin: 0;
  font-family: "Be Vietnam Pro", sans-serif;
  font-weight: 400;
  font-size: 69px;
  line-height: 1.05;
  color: #F95396;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pc__star {
  position: absolute;
  left: 54px;
  top: 118px;
  width: 76px;
  height: 79px;
  object-fit: contain;
}

.pc__dept {
  position: absolute;
  left: 140px;
  top: 118px;
  height: 79px;
  margin: 0;
  display: flex;
  align-items: center;
  font-family: "Be Vietnam Pro", sans-serif;
  font-weight: 700;
  font-size: 28px;
  color: #111;
}

.pc__cal {
  position: absolute;
  left: 62px;
  top: 210px;
  width: 48px;
  height: 48px;
  object-fit: contain;
}

.pc__join {
  position: absolute;
  left: 124px;
  top: 210px;
  height: 48px;
  margin: 0;
  display: flex;
  align-items: center;
  font-family: "Be Vietnam Pro", sans-serif;
  font-weight: 600;
  font-size: 24px;
  color: #111;
}

.pc__join-year {
  color: #F95396;
  font-weight: 600;
}

.pc__qr {
  position: absolute;
  right: 48px;
  top: 118px;
  width: 176px;
  height: 149px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #fff;
  color: #F95396;
  font-family: "Be Vietnam Pro", sans-serif;
  font-weight: 700;
  font-size: 32px;
}

.pc__confetti {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 45%;
  z-index: 4;
  overflow: hidden;
  pointer-events: none;
}

.pc__bit {
  position: absolute;
  opacity: 0;
  animation-name: pc-bit;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
}

.pc__holo {
  position: absolute;
  inset: 0;
  z-index: 8;
  pointer-events: none;
  border-radius: inherit;
  overflow: hidden;
  -webkit-mask-image: radial-gradient(ellipse 48% 40% at 34% 44%, transparent 0 60%, #000 78%);
  mask-image: radial-gradient(ellipse 48% 40% at 34% 44%, transparent 0 60%, #000 78%);
}

.pc--full .pc__holo::after {
  content: "";
  position: absolute;
  top: -30%;
  left: 0;
  width: 36%;
  height: 160%;
  background: linear-gradient(
    102deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.14) 38%,
    rgba(255, 214, 230, 0.32) 50%,
    rgba(255, 255, 255, 0.18) 62%,
    rgba(255, 255, 255, 0) 100%
  );
  opacity: 0;
  transform: translate3d(-180%, 0, 0) skewX(-14deg);
  animation: pc-holo 11.5s linear infinite;
}

@keyframes pc-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.015); }
}

@keyframes pc-glow {
  0%, 100% {
    box-shadow:
      0 22px 48px rgba(140, 20, 70, 0.28),
      inset 0 0 28px rgba(249, 83, 150, 0.08);
  }
  50% {
    box-shadow:
      0 26px 64px rgba(249, 83, 150, 0.55),
      inset 0 0 72px rgba(249, 83, 150, 0.28);
  }
}

@keyframes pc-float-1 {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-10px) rotate(3deg); }
}
@keyframes pc-float-2 {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(8px) rotate(-3deg); }
}
@keyframes pc-float-3 {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-14px) rotate(4deg); }
}
@keyframes pc-float-4 {
  0%, 100% { transform: translateY(3px) rotate(2deg); }
  50% { transform: translateY(-11px) rotate(-4deg); }
}
@keyframes pc-float-5 {
  0%, 100% { transform: translateY(-3px) rotate(3deg); }
  50% { transform: translateY(10px) rotate(-3deg); }
}

@keyframes pc-bit {
  0% { opacity: 0; transform: translate3d(0, 10px, 0) rotate(0deg); }
  18% { opacity: 0.95; }
  100% { opacity: 0; transform: translate3d(var(--dx), var(--dy), 0) rotate(var(--rot)); }
}

@keyframes pc-holo {
  0%, 85% {
    opacity: 0;
    transform: translate3d(-180%, 0, 0) skewX(-14deg);
  }
  87% { opacity: 0.9; }
  97.2% {
    opacity: 0.9;
    transform: translate3d(340%, 0, 0) skewX(-14deg);
  }
  100% {
    opacity: 0;
    transform: translate3d(340%, 0, 0) skewX(-14deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pc--full,
  .pc--full .pc__rubik,
  .pc--full .pc__podium,
  .pc--full .pc__cube-a,
  .pc--full .pc__cube-b,
  .pc--full .pc__cube-c,
  .pc--full .pc__holo::after,
  .pc__bit {
    animation: none;
  }
}
`;

export function PersonCard({ guest, variant = "full", className }: Props) {
  const full = variant === "full";
  const years = useYears(guest.years, full);
  const bits = useConfetti(full);
  const stats = [
    { value: guest.stat1Value, label: guest.stat1Label },
    { value: guest.stat2Value, label: guest.stat2Label },
    { value: guest.stat3Value, label: guest.stat3Label },
  ];
  const rootClass = ["pc", full ? "pc--full" : "", className ?? ""].filter(Boolean).join(" ");

  return (
    <article className={rootClass}>
      <style>{css}</style>
      <img className="pc__logo" src="/figma/M16 Me.We.Impact.svg" alt="" />
      <img className="pc__band" src="/figma/SecurityBand.svg" alt="" />
      <div className="pc__tag">{guest.tag}</div>
      <img className="pc__photo" src={guest.photoUrl} alt="" />
      {full ? (
        <div className="pc__stats">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="pc__stat-value">{stat.value}</p>
              <p className="pc__stat-label">{stat.label}</p>
            </div>
          ))}
        </div>
      ) : null}
      <p className="pc__years">{String(years)}</p>
      <img className="pc__podium" src="/figma/Bục 5@2x.png" alt="" />
      <img className="pc__rubik" src="/figma/Group 255.png" alt="" />
      <img className="pc__cube pc__cube-a" src="/figma/Cube 1 3.png" alt="" />
      <img className="pc__cube pc__cube-b" src="/figma/Cube 4 3.png" alt="" />
      <img className="pc__cube pc__cube-c" src="/figma/Cube 7 3.png" alt="" />
      {bits.length > 0 ? (
        <div className="pc__confetti" aria-hidden="true">
          {bits.map((bit) => (
            <span key={bit.id} className="pc__bit" style={bit.style} />
          ))}
        </div>
      ) : null}
      {full ? <div className="pc__holo" aria-hidden="true" /> : null}
      <footer className="pc__footer">
        <p className="pc__name">{guest.name}</p>
        <img className="pc__star" src="/figma/icon-star@2x.png" alt="" />
        <p className="pc__dept">{guest.department}</p>
        {full ? (
          <>
            <img className="pc__cal" src="/icons/icon-calendar-96.png" alt="" />
            <p className="pc__join">
              <span>Năm gia nhập: </span>
              <span className="pc__join-year">{guest.joinYear}</span>
            </p>
            <div className="pc__qr">QR</div>
          </>
        ) : null}
      </footer>
    </article>
  );
}
