"use client";

import type { RosterCard } from "@/lib/types";

const ROW_COUNT = 5;

function rowsOf(people: RosterCard[]) {
  const rows: RosterCard[][] = Array.from({ length: ROW_COUNT }, () => []);
  people.forEach((person, index) => {
    rows[index % ROW_COUNT].push(person);
  });
  return rows.map((row, index) => (index % 2 === 0 ? row : [...row].reverse()));
}

function rowRole(index: number) {
  if (index === 2) return "is-center";
  if (index === 1 || index === 3) return "is-mid";
  return "is-edge";
}

export function LoopCardMosaic({ people, active }: { people: RosterCard[]; active: boolean }) {
  if (people.length === 0) return null;

  return (
    <div className={`loop-mosaic loop-rows ${active ? "is-on" : ""}`} aria-hidden="true">
      {rowsOf(people).map((row, index) => (
        <div key={index} className={`loop-row ${rowRole(index)} ${index % 2 ? "is-reverse" : ""}`}>
          <div className="loop-row__track">
            {[0, 1].map((copy) =>
              row.map((person) => (
                <div key={`${copy}-${person.code}`} className="loop-tile">
                  <img src={person.thumb || person.photo} alt="" />
                </div>
              )),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
