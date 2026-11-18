"use client";

import type { RosterCard } from "@/lib/types";
import { PersonCard } from "./LoopCardMosaic";

export function CardSheet({ people, width }: { people: RosterCard[]; width?: number }) {
  if (width) {
    return (
      <main className="card-sheet is-single">
        {people.map((person) => (
          <div key={person.code} style={{ width }}>
            <PersonCard person={person} hires />
          </div>
        ))}
      </main>
    );
  }
  return (
    <main className="card-sheet">
      <p className="card-sheet__count">{people.length} thẻ</p>
      <div className="card-sheet__grid">
        {people.map((person) => (
          <figure key={person.code} data-code={person.code}>
            <PersonCard person={person} hires />
            <figcaption>{person.code}</figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
