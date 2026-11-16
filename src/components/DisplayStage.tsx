"use client";

import { useEffect, useRef, useState } from "react";

import type { BoothId } from "@/lib/booths-shared";
import type { PublicSpotlight, RosterCard } from "@/lib/types";
import { LoopCardMosaic, PersonCard } from "./LoopCardMosaic";
import { useBoothChannel } from "./useBoothChannel";

const CUBES = [
  { src: "/cubes/cube-1.png", className: "cube c1" },
  { src: "/cubes/cube-2.png", className: "cube c2" },
  { src: "/cubes/cube-3.png", className: "cube c3" },
  { src: "/cubes/cube-4.png", className: "cube c4" },
  { src: "/cubes/cube-5.png", className: "cube c5" },
];

const SPOT_EXIT_MS = 700;

type SpotCard = { key: string; person: RosterCard; leaving: boolean };

function spotPerson(spotlight: PublicSpotlight, roster: RosterCard[]): RosterCard {
  const known = roster.find((person) => person.code === spotlight.code);
  return {
    ...known,
    code: spotlight.code,
    name: spotlight.name,
    department: spotlight.department,
    years: spotlight.years,
    photo: spotlight.photo || known?.photo || "",
  };
}

export function DisplayStage({ boothId, label, title }: { boothId: BoothId; label: string; title: string }) {
  const { snapshot, roster, link } = useBoothChannel(boothId);
  const stageRef = useRef<HTMLDivElement>(null);
  const [spots, setSpots] = useState<SpotCard[]>([]);
  const spotlight = snapshot?.spotlight ?? null;
  const liveCode = spotlight?.code ?? "";
  const phase = spotlight ? "reveal" : "loop";
  const cardsOn = !spotlight && roster.length > 0;

  useEffect(() => {
    setSpots((current) => {
      const shown = current.find((card) => !card.leaving);
      if ((shown?.person.code ?? "") === liveCode) return current;
      const next = current.map((card) => (card.leaving ? card : { ...card, leaving: true }));
      if (spotlight) {
        next.push({ key: `${spotlight.code}-${spotlight.startedAt}`, person: spotPerson(spotlight, roster), leaving: false });
      }
      return next;
    });
  }, [liveCode, spotlight, roster]);

  useEffect(() => {
    if (!spots.some((card) => card.leaving)) return;
    const timer = window.setTimeout(() => {
      setSpots((current) => current.filter((card) => !card.leaving));
    }, SPOT_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [spots]);

  useEffect(() => {
    const upcoming = [spotlight?.photo, ...(snapshot?.queue ?? []).map((item) => item.photo)];
    for (const url of upcoming) {
      if (url) new Image().src = url;
    }
  }, [spotlight?.photo, snapshot?.queue]);

  return (
    <div className="viewport">
      <div
        className="stage"
        ref={stageRef}
        data-booth={boothId}
        data-phase={phase}
        data-live={liveCode}
        data-cards={cardsOn ? "1" : "0"}
        onDoubleClick={() => {
          if (!document.fullscreenElement) void stageRef.current?.requestFullscreen?.();
        }}
      >
        {CUBES.map((cube) => (
          <img key={cube.src} src={cube.src} alt="" className={cube.className} />
        ))}
        <LoopCardMosaic people={roster} active={roster.length > 0} />
        <p className="booth-tag">{label}</p>
        <div className="loop-scrim" />
        <div className="loop-caption">
          <p className="loop-caption__eyebrow">Những mảnh ghép</p>
          <h1>{title}</h1>
          <span className="loop-caption__rule" />
          <img className="wordmark" src="/brand/the-power-of-small.png" alt="The Power of Small" />
        </div>
        <div className="spot" aria-live="polite">
          {spots.map((card) => (
            <div key={card.key} className={`spot__card ${card.leaving ? "is-out" : "is-in"}`}>
              <PersonCard person={card.person} hires />
            </div>
          ))}
        </div>
        {link === "down" ? <p className="offline">Đang kết nối lại…</p> : null}
      </div>
    </div>
  );
}
