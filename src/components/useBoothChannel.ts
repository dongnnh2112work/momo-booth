"use client";

import { useEffect, useState } from "react";

import type { BoothId } from "@/lib/booths-shared";
import { FALLBACK_POLL_MS } from "@/lib/timing";
import type { PublicSnapshot, RosterCard } from "@/lib/types";

export function useBoothChannel(boothId: BoothId) {
  const [snapshot, setSnapshot] = useState<PublicSnapshot | null>(null);
  const [roster, setRoster] = useState<RosterCard[]>([]);
  const [link, setLink] = useState<"pending" | "up" | "down">("pending");

  useEffect(() => {
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
              item.photo === next[index]?.photo &&
              item.thumb === next[index]?.thumb,
          )
        ) {
          return previous;
        }
        return next;
      });
    };

    const pull = async () => {
      try {
        const headers: Record<string, string> = {};
        if (etag) headers["If-None-Match"] = etag;
        const response = await fetch(`/api/booths/${boothId}`, { cache: "no-store", headers });
        if (response.status === 304) {
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
