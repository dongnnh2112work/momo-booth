"use client";

import { useEffect, useState } from "react";

import type { Booth } from "@/lib/booths-shared";
import { publicBaseUrl, type PublicBaseEnv } from "@/lib/publicBaseUrl";

export function SetupHome({ booths, baseEnv = {} }: { booths: Booth[]; baseEnv?: PublicBaseEnv }) {
  const preferred = baseEnv.PUBLIC_BASE_URL;
  const clientVisible = baseEnv.NEXT_PUBLIC_BASE_URL;
  const [origin, setOrigin] = useState(() => publicBaseUrl({ PUBLIC_BASE_URL: preferred, NEXT_PUBLIC_BASE_URL: clientVisible }, ""));
  const [codes, setCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    // PUBLIC_BASE_URL, else NEXT_PUBLIC_BASE_URL, else this page's origin.
    setOrigin(publicBaseUrl({ PUBLIC_BASE_URL: preferred, NEXT_PUBLIC_BASE_URL: clientVisible }, window.location.origin));
  }, [preferred, clientVisible]);

  useEffect(() => {
    if (!origin) return;
    let cancelled = false;
    void import("qrcode").then(async (QR) => {
      const entries = await Promise.all(
        booths.map(async (booth) => {
          const url = `${origin}/c/${booth.id}`;
          const image = await QR.toDataURL(url, {
            margin: 1,
            width: 560,
            errorCorrectionLevel: "M",
            color: { dark: "#4c1232", light: "#ffffff" },
          });
          return [booth.id, image] as const;
        }),
      );
      if (!cancelled) setCodes(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [origin, booths]);

  return (
    <main className="setup">
      <header className="setup-head">
        <p className="brand">momo</p>
        <h1>Booth vinh danh</h1>
        <p>
          Mỗi booth một màn hình và một QR. Mở đúng link trên đúng màn, rồi đưa QR cho nhân sự quét. Điện thoại và
          máy chiếu cần vào cùng địa chỉ này.
        </p>
        <p className="quiet no-print">Chạy một process duy nhất. Đặt STAFF_KEY riêng trước khi mở sự kiện.</p>
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
        {booths.map((booth) => {
          const id = booth.id;
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
