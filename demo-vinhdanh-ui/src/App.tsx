import { useCallback, useEffect, useState } from "react";
import { LiteStage } from "./components/LiteStage.tsx";
import { Tube } from "./components/Tube.tsx";
import { loadGuests, type Guest } from "./data/loadGuests.ts";

function readLiteMode(): boolean {
  const lite = new URLSearchParams(window.location.search).get("lite");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return lite === "1" || lite === "true" || reduced;
}

export default function App() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lite] = useState(readLiteMode);

  useEffect(() => {
    let active = true;
    loadGuests()
      .then((list) => {
        if (!active) return;
        setGuests(list);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Không tải được danh sách");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const cycle = useCallback(() => {
    setSelectedIndex((current) => (guests.length === 0 ? 0 : (current + 1) % guests.length));
  }, [guests.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === " ") {
        if (event.key === " ") event.preventDefault();
        cycle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cycle]);

  const message = loading ? "Đang tải…" : error ? error : guests.length === 0 ? "Không có khách" : null;

  return (
    <div className="stage-wrap">
      <div className="stage">
        <div className="stage__bg" aria-hidden="true" />
        {guests.length > 0 ? (
          <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
            {lite ? <LiteStage guests={guests} /> : <Tube guests={guests} />}
          </div>
        ) : null}
        {message ? (
          <p
            style={{
              position: "absolute",
              zIndex: 2,
              left: 24,
              right: 24,
              top: "46%",
              margin: 0,
              color: "#fff",
              textAlign: "center",
              fontFamily: '"Be Vietnam Pro", sans-serif',
              fontSize: 28,
            }}
          >
            {message}
          </p>
        ) : null}
        <button
          type="button"
          aria-label="cycle"
          data-selected-index={selectedIndex}
          onClick={cycle}
          style={{
            position: "absolute",
            right: 16,
            bottom: 16,
            zIndex: 5,
            width: 28,
            height: 28,
            opacity: 0.25,
            border: "none",
            borderRadius: 14,
            background: "#fff",
            cursor: "pointer",
          }}
        />
      </div>
    </div>
  );
}
