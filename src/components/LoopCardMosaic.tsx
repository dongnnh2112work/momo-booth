"use client";

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
const YEAR_ART = new Set([5, 10, 15]);

function milestones(person: RosterCard) {
  return person.joinedYear ? EVENT_YEAR - person.joinedYear + 1 : person.years;
}

export function PersonCard({ person, hires = false }: { person: RosterCard; hires?: boolean }) {
  const art = YEAR_ART.has(person.years) ? person.years : 5;
  return (
    <article className="pc">
      <img className="pc__photo" src={hires ? person.photo : person.thumb || person.photo} alt="" />
      <img className="pc__pattern" src="/card/pattern-side.png" alt="" />
      <img className="pc__cubes" src="/card/cubes-stack.png" alt="" />
      <div className="pc__footer" />
      <img className="pc__logo" src="/card/logo-momo16.png" alt="" />
      {person.badge ? <p className="pc__badge">{person.badge}</p> : null}
      <p className="pc__mile">
        <b>{milestones(person)}</b>
        <span>cột mốc</span>
      </p>
      <p className="pc__label is-mile">cùng MoMo</p>
      <p className="pc__num is-peers">700+</p>
      <p className="pc__label is-peers">đồng nghiệp</p>
      <p className="pc__num is-momoers">2000+</p>
      <p className="pc__label is-momoers">MoMoers</p>
      <img className="pc__cube-small" src="/card/cube-small.png" alt="" />
      <img className={`pc__years is-${art}`} src={`/card/num-${art}.png`} alt={String(person.years)} />
      <p className="pc__name">{person.name}</p>
      <p className="pc__dept">{person.department}</p>
      <span className="pc__rule" />
      {person.joinedYear ? (
        <>
          <p className="pc__join">Năm gia nhập:</p>
          <p className="pc__join-year">{person.joinedYear}</p>
        </>
      ) : null}
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
