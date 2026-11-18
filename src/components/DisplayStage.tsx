"use client";

import { useEffect, useRef, useState } from "react";

import type { BoothId } from "@/lib/booths-shared";
import type { PublicSpotlight, RosterCard } from "@/lib/types";
import { LoopCardMosaic, PersonCard } from "./LoopCardMosaic";
import { LoopCornerQr } from "./LoopCornerQr";
import { useBoothChannel } from "./useBoothChannel";

const CUBES = [
  { src: "/cubes/cube-1.png", className: "cube c1" },
  { src: "/cubes/cube-2.png", className: "cube c2" },
  { src: "/cubes/cube-3.png", className: "cube c3" },
  { src: "/cubes/cube-4.png", className: "cube c4" },
  { src: "/cubes/cube-5.png", className: "cube c5" },
];

const SPOT_EXIT_MS = 700;
const PREVIEW_LOOP_MS = 15_000;
const PREVIEW_HOLD_MS = 8_000;

type SpotCard = { key: string; person: RosterCard; leaving: boolean };

function spotPerson(spotlight: PublicSpotlight, roster: RosterCard[]): RosterCard {
  const known = roster.find((person) => person.code === spotlight.code);
  return {
    code: spotlight.code,
    name: spotlight.name,
    department: spotlight.department,
    years: spotlight.years,
    photo: spotlight.photo || known?.photo || "",
    thumb: known?.thumb,
    badge: known?.badge,
    joinedYear: known?.joinedYear,
  };
}

function sameSpotPerson(a: RosterCard, b: RosterCard) {
  return (
    a.code === b.code &&
    a.photo === b.photo &&
    a.badge === b.badge &&
    a.joinedYear === b.joinedYear &&
    a.name === b.name &&
    a.department === b.department &&
    a.years === b.years
  );
}

export function DisplayStage({
  boothId,
  label,
  title,
  previewSlide = false,
  checkInUrl = "",
}: {
  boothId: BoothId;
  label: string;
  title: string;
  previewSlide?: boolean;
  checkInUrl?: string;
}) {
  const { snapshot, roster, link } = useBoothChannel(boothId);
  const stageRef = useRef<HTMLDivElement>(null);
  const previewIndex = useRef(0);
  const rosterRef = useRef(roster);
  rosterRef.current = roster;
  const [spots, setSpots] = useState<SpotCard[]>([]);
  const [preview, setPreview] = useState<SpotCard | null>(null);
  const spotlight = snapshot?.spotlight ?? null;
  const liveCode = spotlight?.code ?? "";
  const featuring = Boolean(preview && !preview.leaving);
  const phase = spotlight || featuring ? "reveal" : "loop";
  const cardsOn = !spotlight && !featuring && roster.length > 0;

  useEffect(() => {
    setSpots((current) => {
      const shown = current.find((card) => !card.leaving);
      if (spotlight && (shown?.person.code ?? "") === liveCode) {
        const person = spotPerson(spotlight, roster);
        if (shown && sameSpotPerson(shown.person, person)) return current;
        return current.map((card) => (card.leaving ? card : { ...card, person }));
      }
      const next = current.map((card) => (card.leaving ? card : { ...card, leaving: true }));
      if (spotlight) {
        next.push({
          key: `${spotlight.code}-${spotlight.startedAt}`,
          person: spotPerson(spotlight, roster),
          leaving: false,
        });
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
    if (!previewSlide || liveCode || rosterRef.current.length === 0) {
      setPreview(null);
      return;
    }
    let timer = 0;
    let stopped = false;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = window.setTimeout(resolve, ms);
      });
    const cycle = async () => {
      while (!stopped) {
        await wait(PREVIEW_LOOP_MS);
        if (stopped) return;
        const people = rosterRef.current;
        if (people.length === 0) continue;
        const person = people[previewIndex.current % people.length];
        previewIndex.current += 1;
        setPreview({ key: `preview-${person.code}-${previewIndex.current}`, person, leaving: false });
        await wait(PREVIEW_HOLD_MS);
        if (stopped) return;
        setPreview((current) => (current ? { ...current, leaving: true } : null));
        await wait(SPOT_EXIT_MS);
        if (stopped) return;
        setPreview(null);
      }
    };
    void cycle();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [previewSlide, liveCode, roster.length]);

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
        <LoopCornerQr boothId={boothId} checkInUrl={checkInUrl} />
        <div className="loop-caption">
          <p className="loop-caption__eyebrow">Những mảnh ghép</p>
          <h1>{title}</h1>
          <span className="loop-caption__rule" />
          <img className="wordmark" src="/brand/the-power-of-small.png" alt="The Power of Small" />
        </div>
        <div className="spot" aria-live="polite">
          {(spotlight ? spots : preview ? [preview] : []).map((card) => (
            <div
              key={card.key}
              className={`spot__card ${previewSlide && !spotlight ? "is-pop" : ""} ${card.leaving ? "is-out" : "is-in"}`}
            >
              <PersonCard person={card.person} hires />
            </div>
          ))}
        </div>
        {link === "down" ? <p className="offline">Đang kết nối lại…</p> : null}
      </div>
    </div>
  );
}
