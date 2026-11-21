"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";

import type { RosterCard } from "@/lib/types";

const COLUMN_COUNT = 3;
const SECONDS_PER_CARD = 3.64;

function columnsOf(people: RosterCard[]) {
  const columns: RosterCard[][] = Array.from({ length: COLUMN_COUNT }, () => []);
  people.forEach((person, index) => {
    columns[index % COLUMN_COUNT].push(person);
  });
  return columns;
}

const EVENT_YEAR = 2026;
const YEAR_ART: Record<number, string> = {
  5: "/card/m16/num-5.webp",
  10: "/card/num-10.png",
  15: "/card/num-15.png",
};

function milestones(person: RosterCard) {
  return person.joinedYear ? EVENT_YEAR - person.joinedYear + 1 : person.years;
}

function positive(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

// 5695 -> "5.695", the Vietnamese thousands mark.
function formatCount(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// "2011-04-18" -> "18/04/2011"
function formatDate(value: string | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

// Shrinks a single line of card text until it fits the width it was given in CSS.
// Sizes are in cqw, so the ratio measured once holds for every card size.
function FitLine({ className, text }: { className: string; text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    let cancelled = false;
    const measure = () => {
      const el = ref.current;
      if (cancelled || !el) return;
      el.style.setProperty("--fit", "1");
      const ratio = el.scrollWidth > 0 ? el.clientWidth / el.scrollWidth : 1;
      if (ratio < 1) el.style.setProperty("--fit", String(Math.max(0.55, Math.floor(ratio * 1000) / 1000)));
    };
    measure();
    void document.fonts?.ready.then(measure);
    return () => {
      cancelled = true;
    };
  }, [text]);

  return (
    <p ref={ref} className={className}>
      <span>{text}</span>
    </p>
  );
}

// Some portraits are framed wider than the PSD sample and would cover the copy
// on the left; data/roster.json gives those a photoScale below 1.
function photoScale(person: RosterCard): CSSProperties | undefined {
  const scale = person.photoScale;
  if (typeof scale !== "number" || !Number.isFinite(scale) || scale >= 1 || scale <= 0.5) return undefined;
  return { "--photo-scale": String(scale) } as CSSProperties;
}

// Layout follows "M16 | VINH DANH 5-10-15.psd" (2126×3780). See .pc rules in globals.css.
export function PersonCard({ person, hires = false }: { person: RosterCard; hires?: boolean }) {
  const art = YEAR_ART[person.years] ? person.years : 5;
  // Round 4 of the customer sheet: column M (days), K (teammates), L (join date).
  // People the sheet left blank keep the earlier milestones / 700+ / year copy.
  const days = positive(person.daysWithMomo);
  const teammates = positive(person.teammates);
  const joinedDate = formatDate(person.joinedDate);
  const joined = joinedDate || (person.joinedYear ? String(person.joinedYear) : "");
  return (
    <article className="pc">
      <img
        className="pc__photo"
        src={hires ? person.photo : person.thumb || person.photo}
        alt=""
        style={photoScale(person)}
      />
      <img className="pc__band" src="/card/m16/band.webp" alt="" />
      <img className="pc__logo" src="/card/m16/logo.webp" alt="" />
      {person.badge ? <FitLine className="pc__badge" text={person.badge} /> : null}
      {days ? (
        <p className="pc__num is-mile">
          {formatCount(days)}
          <span className="pc__unit">ngày</span>
        </p>
      ) : (
        <p className="pc__num is-mile">
          {milestones(person)}
          <span className="pc__unit">cột mốc</span>
        </p>
      )}
      <p className="pc__label is-mile-b">cùng MoMo</p>
      <p className="pc__num is-peers">{teammates ? formatCount(teammates) : "700+"}</p>
      <p className="pc__label is-peers">đồng đội</p>
      {joined ? (
        <>
          <p className={`pc__num is-join${joinedDate ? " is-date" : ""}`}>{joined}</p>
          <p className="pc__label is-join">nhập hội MoMo</p>
        </>
      ) : null}
      <img className="pc__podium" src="/card/m16/podium.webp" alt="" />
      <img className={`pc__years is-${art}`} src={YEAR_ART[art]} alt={String(person.years)} />
      <img className="pc__panel" src="/card/m16/panel.webp" alt="" />
      <FitLine className="pc__name" text={person.name} />
      <span className="pc__rule" />
      <FitLine className="pc__dept" text={person.department} />
    </article>
  );
}

export function LoopCardMosaic({ people, active }: { people: RosterCard[]; active: boolean }) {
  if (people.length === 0) return null;

  return (
    <div className={`loop-mosaic loop-columns ${active ? "is-on" : ""}`} aria-hidden="true">
      {columnsOf(people).map((column, index) => (
        <div key={index} className={`loop-col ${index === 1 ? "is-up" : "is-down"}`}>
          <div
            className="loop-col__track"
            style={{
              animationDuration: `${column.length * SECONDS_PER_CARD}s`,
              animationDelay: index === 1 ? `${-column.length * SECONDS_PER_CARD * 0.174}s` : undefined,
            }}
          >
            {[0, 1].map((copy) =>
              column.map((person) => (
                <div key={`${copy}-${person.code}`} className="loop-card">
                  <PersonCard person={person} />
                </div>
              )),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
