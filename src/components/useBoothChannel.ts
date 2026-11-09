"use client";

import { useEffect, useState } from "react";

import type { BoothId } from "@/lib/booths";
import type { PublicSnapshot, RosterCard } from "@/lib/types";

export function useBoothChannel(boothId: BoothId) {
  const [snapshot, setSnapshot] = useState<PublicSnapshot | null>(null);
  const [roster, setRoster] = useState<RosterCard[]>([]);
  const [link, setLink] = useState<"pending" | "up" | "down">("pending");

  useEffect(() => {
    let stopped = false;

    const applySnapshot = (snap: PublicSnapshot) => {
      setSnapshot((previous) => {
        if (previous && snap.revision < previous.revision) return previous;
        return snap;
      });
    };

    const applyRoster = (next: RosterCard[]) => {
      setRoster((previous) => {
        if (
          previous.length === next.length &&
          previous.every((item, index) => item.code === next[index]?.code && item.photo === next[index]?.photo)
        ) {
          return previous;
        }
        return next;
      });
    };

    const pull = async () => {
      try {
        const response = await fetch(`/api/booths/${boothId}`, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { snapshot: PublicSnapshot; roster: RosterCard[] };
        if (stopped) return;
        applySnapshot(data.snapshot);
        applyRoster(data.roster);
        setLink("up");
      } catch {
        if (!stopped) setLink("down");
      }
    };

    void pull();
    const source = new EventSource(`/api/booths/${boothId}/events`);
    source.addEventListener("snapshot", (event) => {
      const message = event as MessageEvent<string>;
      try {
        applySnapshot(JSON.parse(message.data) as PublicSnapshot);
        if (!stopped) setLink("up");
      } catch {
        if (!stopped) setLink("down");
      }
    });
    source.onerror = () => {
      if (!stopped) setLink("down");
    };
    const poll = window.setInterval(() => {
      void pull();
    }, 1000);

    return () => {
      stopped = true;
      window.clearInterval(poll);
      source.close();
    };
  }, [boothId]);

  return { snapshot, roster, link };
}
