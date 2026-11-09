"use client";

import { useEffect, useRef, useState } from "react";

import { BOOTHS, type BoothId } from "@/lib/booths";
import type { PublicSpotlight } from "@/lib/types";
import { createDisplayEngine, type RevealPhase } from "./displayEngine";
import { useBoothChannel } from "./useBoothChannel";

const CUBES = [
  { src: "/cubes/cube-1.png", className: "cube c1" },
  { src: "/cubes/cube-2.png", className: "cube c2" },
  { src: "/cubes/cube-3.png", className: "cube c3" },
  { src: "/cubes/cube-4.png", className: "cube c4" },
  { src: "/cubes/cube-5.png", className: "cube c5" },
];

export function DisplayStage({ boothId }: { boothId: BoothId }) {
  const booth = BOOTHS[boothId];
  const { snapshot, roster, link } = useBoothChannel(boothId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ReturnType<typeof createDisplayEngine> | null>(null);
  const [phase, setPhase] = useState<RevealPhase>("loop");
  const [shown, setShown] = useState<PublicSpotlight | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const liveCode = snapshot?.spotlight?.code ?? "";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = createDisplayEngine(canvas, (next) => {
      setPhase((previous) => (previous === next ? previous : next));
    });
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setRoster(roster.map((person) => person.photo));
  }, [roster]);

  useEffect(() => {
    const spotlight = snapshot?.spotlight;
    engineRef.current?.setSpotlight(spotlight?.code ?? null, spotlight?.photo || null);
  }, [snapshot?.spotlight?.code, snapshot?.spotlight?.photo]);

  useEffect(() => {
    if (phase === "reveal" && snapshot?.spotlight && snapshot.spotlight.code !== shown?.code) {
      setShown(snapshot.spotlight);
    }
  }, [phase, snapshot, shown?.code]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  return (
    <div className="viewport">
      <div
        className="stage"
        ref={stageRef}
        data-booth={boothId}
        data-phase={phase}
        data-live={liveCode}
      >
        {CUBES.map((cube) => (
          <img key={cube.src} src={cube.src} alt="" className={cube.className} />
        ))}
        <canvas ref={canvasRef} />
        <div className="scrim" />
        <p className="booth-tag">{booth.label}</p>
        <div className={`reveal ${phase === "reveal" ? "show" : ""}`}>
          {shown ? (
            <>
              <p className="thanks">
                Thank you
                <br />
                for being you! <span aria-hidden="true">♥</span>
              </p>
              <p className="years">
                <b>{shown.years}</b>
                <span>
                  YEARS
                  <br />
                  WITH MOMO
                </span>
              </p>
              <div className="identity">
                <h2>{shown.name}</h2>
                <p className="pill">
                  <span aria-hidden="true">☺</span>
                  {shown.department}
                </p>
              </div>
            </>
          ) : null}
        </div>
        <div className="loop-caption">
          <p>Những mảnh ghép của MoMo</p>
          <h1>{booth.title}</h1>
        </div>
        <div className="loop-scrim" />
        <div className="wordmarks">
          <img className="wordmark" src="/brand/the-power-of-small.svg" alt="The Power of Small. Me. We. Impact." />
        </div>
        {link === "down" ? <p className="offline">Đang kết nối lại…</p> : null}
        {!fullscreen && phase !== "reveal" ? (
          <button
            type="button"
            className="fs-btn"
            onClick={() => {
              void stageRef.current?.requestFullscreen?.();
            }}
          >
            Toàn màn hình
          </button>
        ) : null}
      </div>
    </div>
  );
}
