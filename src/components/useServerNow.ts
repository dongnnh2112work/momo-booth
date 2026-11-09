"use client";

import { useEffect, useState } from "react";

export function useServerNow(serverNow: number | undefined) {
  const [now, setNow] = useState(() => serverNow ?? Date.now());

  useEffect(() => {
    const offset = (serverNow ?? Date.now()) - Date.now();
    setNow(Date.now() + offset);
    const id = window.setInterval(() => setNow(Date.now() + offset), 250);
    return () => window.clearInterval(id);
  }, [serverNow]);

  return now;
}
