import { useState } from "react";
import type { Guest } from "../data/loadGuests.ts";
import { PersonCard } from "./PersonCard.tsx";

const MAX_CARDS = 11;

export function LiteStage({ guests }: { guests: Guest[] }) {
  const [reducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const shown = guests.slice(0, Math.min(MAX_CARDS, guests.length));
  const n = shown.length;
  if (n === 0) return null;

  const step = 360 / n;

  return (
    <div className="lite-stage">
      <style>{`
        .lite-stage {
          position: absolute;
          inset: 0;
          z-index: 1;
          overflow: hidden;
          perspective: 1400px;
          perspective-origin: 50% 50%;
          pointer-events: none;
        }
        .lite-ring {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 0;
          height: 0;
          transform-style: preserve-3d;
        }
        .lite-ring.is-spin {
          animation: lite-spin 36s linear infinite;
        }
        .lite-ring.is-static {
          transform: rotateY(0deg);
        }
        .lite-slot {
          position: absolute;
          left: 50%;
          top: 50%;
          transform-style: preserve-3d;
        }
        .lite-card-scale {
          transform: scale(0.42);
          transform-origin: center center;
        }
        @keyframes lite-spin {
          from { transform: rotateY(0deg); }
          to { transform: rotateY(360deg); }
        }
      `}</style>
      <div className={reducedMotion ? "lite-ring is-static" : "lite-ring is-spin"}>
        {shown.map((g, i) => (
          <div
            key={i}
            className="lite-slot"
            style={{
              transform: `translate(-50%, -50%) rotateY(${i * step}deg) translateZ(420px)`,
            }}
          >
            <div className="lite-card-scale">
              <PersonCard guest={g} variant="tube" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
