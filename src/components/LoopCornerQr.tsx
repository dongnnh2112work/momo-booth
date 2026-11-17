"use client";

import { useEffect, useState } from "react";

export function LoopCornerQr({ checkInUrl }: { checkInUrl: string }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    const origin = (checkInUrl || window.location.origin).replace(/\/+$/, "");
    const target = `${origin}/c`;
    let cancelled = false;
    void import("qrcode").then(async (QR) => {
      const image = await QR.toDataURL(target, {
        margin: 1,
        width: 480,
        errorCorrectionLevel: "M",
        color: { dark: "#4c1232", light: "#ffffff" },
      });
      if (!cancelled) setSrc(image);
    });
    return () => {
      cancelled = true;
    };
  }, [checkInUrl]);

  return (
    <aside className="loop-qr">
      {src ? <img src={src} alt="QR check-in" /> : <div className="loop-qr__box" />}
      <p>Quét để check-in</p>
    </aside>
  );
}
