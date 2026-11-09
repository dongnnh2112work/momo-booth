"use client";

import { useEffect, useState } from "react";

import { BOOTH_IDS, BOOTHS } from "@/lib/booths";

export function SetupHome() {
  const [origin, setOrigin] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!origin) return;
    let cancelled = false;
    void import("qrcode").then(async (QR) => {
      const entries = await Promise.all(
        BOOTH_IDS.map(async (id) => {
          const url = `${origin}/c/${id}`;
          const image = await QR.toDataURL(url, {
            margin: 1,
            width: 560,
            errorCorrectionLevel: "M",
            color: { dark: "#4c1232", light: "#ffffff" },
          });
          return [id, image] as const;
        }),
      );
      if (!cancelled) setCodes(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [origin]);

  return (
    <main className="setup">
      <header className="setup-head">
        <p className="brand">momo</p>
        <h1>Booth vinh danh</h1>
        <p>
          Mỗi booth một màn hình và một QR. Mở đúng link trên đúng màn, rồi đưa QR cho nhân sự quét. Điện thoại và
          máy chiếu cần vào cùng địa chỉ này.
        </p>
        <p className="quiet no-print">Chạy một process duy nhất. Khóa điều phối mặc định: momo-ptb.</p>
        <div className="setup-actions no-print">
          <a className="ghost" href="/staff">
            Bảng điều phối
          </a>
          <button type="button" className="primary" onClick={() => window.print()}>
            In QR
          </button>
        </div>
      </header>
      <div className="setup-grid">
        {BOOTH_IDS.map((id) => {
          const booth = BOOTHS[id];
          const checkin = origin ? `${origin}/c/${id}` : `/c/${id}`;
          const display = origin ? `${origin}/d/${id}` : `/d/${id}`;
          return (
            <article className="qr-card" key={id}>
              <p className="eyebrow">{booth.label}</p>
              <h2>{booth.title}</h2>
              <p>{booth.blurb}</p>
              {codes[id] ? <img className="qr" src={codes[id]} alt={`QR check-in ${booth.label}`} /> : <div className="qr skeleton" />}
              <p className="url">{checkin}</p>
              <p className="quiet">Mã thử {booth.sample}</p>
              <div className="setup-actions no-print">
                <a className="primary" href={`/d/${id}`}>
                  Mở màn hình
                </a>
                <a className="ghost" href={`/c/${id}`}>
                  Mở check-in
                </a>
              </div>
              <p className="quiet no-print">{display}</p>
            </article>
          );
        })}
      </div>
    </main>
  );
}
