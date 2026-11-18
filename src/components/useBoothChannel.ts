"use client";

import { useEffect, useState } from "react";

import type { BoothId } from "@/lib/booths-shared";
import { FALLBACK_POLL_MS } from "@/lib/timing";
import type { PublicSnapshot, RosterCard } from "@/lib/types";

export function useBoothChannel(boothId: BoothId | null) {
  const [snapshot, setSnapshot] = useState<PublicSnapshot | null>(null);
  const [roster, setRoster] = useState<RosterCard[]>([]);
  const [link, setLink] = useState<"pending" | "up" | "down">("pending");

  useEffect(() => {
    if (!boothId) return;
    let stopped = false;
    let etag: string | null = null;

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
          previous.every(
            (item, index) =>
              item.code === next[index]?.code &&
              item.name === next[index]?.name &&
              item.years === next[index]?.years &&
              item.department === next[index]?.department &&
              item.badge === next[index]?.badge &&
              item.joinedYear === next[index]?.joinedYear &&
              item.photo === next[index]?.photo &&
              item.thumb === next[index]?.thumb &&
              item.photoScale === next[index]?.photoScale,
          )
        ) {
          return previous;
        }
        return next;
      });
    };

    let pollMisses = 0;
    const pull = async () => {
      try {
        const headers: Record<string, string> = {};
        if (etag) headers["If-None-Match"] = etag;
        const response = await fetch(`/api/booths/${boothId}`, { cache: "no-store", headers });
        if (response.status === 304) {
          pollMisses = 0;
          if (!stopped) setLink("up");
          return;
        }
        if (!response.ok) throw new Error(String(response.status));
        const nextTag = response.headers.get("ETag");
        if (nextTag) etag = nextTag;
        const data = (await response.json()) as { snapshot: PublicSnapshot; roster: RosterCard[] };
        if (stopped) return;
        applySnapshot(data.snapshot);
        applyRoster(data.roster);
        pollMisses = 0;
        setLink("up");
      } catch {
        pollMisses += 1;
        if (!stopped && pollMisses >= 3) setLink("down");
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
      void pull();
    };
    const poll = window.setInterval(() => {
      void pull();
    }, FALLBACK_POLL_MS);

    return () => {
      stopped = true;
      window.clearInterval(poll);
      source.close();
    };
  }, [boothId]);

  return { snapshot, roster, link };
}
