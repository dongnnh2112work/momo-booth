"use client";

import { useEffect, useState } from "react";

import type { BoothId } from "@/lib/booths-shared";

export function LoopCornerQr({ boothId, checkInUrl }: { boothId: BoothId; checkInUrl: string }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const load = async () => {
      try {
        const response = await fetch(`/api/booths/${boothId}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { checkIn?: { token?: string; expiresAt?: number } };
        const token = data.checkIn?.token;
        if (!token) return;
        const origin = (checkInUrl || window.location.origin).replace(/\/+$/, "");
        const target = `${origin}/c?k=${encodeURIComponent(token)}`;
        const QR = await import("qrcode");
        const image = await QR.toDataURL(target, {
          margin: 1,
          width: 480,
          errorCorrectionLevel: "M",
          color: { dark: "#4c1232", light: "#ffffff" },
        });
        if (!cancelled) setSrc(image);
        const expiresAt = data.checkIn?.expiresAt ?? Date.now() + 60_000;
        const wait = Math.min(60_000, Math.max(1000, expiresAt - Date.now() + 500));
        timer = window.setTimeout(() => void load(), wait);
      } catch {
        timer = window.setTimeout(() => void load(), 15_000);
      }
    };
    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [boothId, checkInUrl]);

  return (
    <aside className="loop-qr">
      {src ? <img src={src} alt="QR check-in" /> : <div className="loop-qr__box" />}
      <p>Quét để nhập mã</p>
    </aside>
  );
}
