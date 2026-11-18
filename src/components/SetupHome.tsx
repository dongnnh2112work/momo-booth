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
    const boothId = booths[0]?.id;
    if (!boothId) return;
    let cancelled = false;
    let timer = 0;
    const load = async () => {
      try {
        const response = await fetch(`/api/booths/${boothId}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { checkIn?: { token?: string; expiresAt?: number } };
        const token = data.checkIn?.token;
        if (!token) return;
        const QR = await import("qrcode");
        const image = await QR.toDataURL(`${origin}/c?k=${encodeURIComponent(token)}`, {
          margin: 1,
          width: 560,
          errorCorrectionLevel: "M",
          color: { dark: "#4c1232", light: "#ffffff" },
        });
        if (!cancelled) setCodes({ shared: image });
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
  }, [origin, booths]);

  return (
    <main className="setup">
      <header className="setup-head">
        <p className="brand">momo</p>
        <h1>Booth vinh danh</h1>
        <p>
          QR check-in nằm ở góc màn loop và đổi mỗi 15 phút. Khách quét QR rồi nhập mã nhân viên. Mỗi
          TV mở đúng link màn hình của mình. Điện thoại và máy chiếu cần vào cùng địa chỉ này.
        </p>
        <p className="quiet no-print">Chạy một process duy nhất. Đặt STAFF_KEY riêng trước khi mở sự kiện.</p>
        {origin && /localhost|127\.0\.0\.1|\.local(?::\d+)?$/i.test(origin) ? (
          <p className="banner">QR này là địa chỉ máy local. Điện thoại khách không mở được.</p>
        ) : null}
        <div className="setup-actions no-print">
          <a className="ghost" href="/staff">
            Bảng điều phối
          </a>
          <button type="button" className="primary" onClick={() => window.print()}>
            In QR
          </button>
        </div>
      </header>
      <article className="qr-card qr-card-shared">
        <p className="eyebrow">Một QR</p>
        <h2>Check-in</h2>
        <p>Cùng một QR đang ở góc phải màn loop. Quét xong, điện thoại mở trang nhập mã nhân viên. Mã QR đổi mỗi 15 phút.</p>
        {codes.shared ? <img className="qr" src={codes.shared} alt="QR check-in" /> : <div className="qr skeleton" />}
        <p className="url">{origin ? `${origin}/c` : "/c"}</p>
        <div className="setup-actions no-print">
          <a className="primary" href="/c">
            Mở check-in
          </a>
        </div>
      </article>
      <div className="setup-grid">
        {booths.map((booth) => {
          const id = booth.id;
          const display = origin ? `${origin}/d/${id}` : `/d/${id}`;
          return (
            <article className="qr-card" key={id}>
              <p className="eyebrow">{booth.label}</p>
              <h2>{booth.title}</h2>
              <p>{booth.blurb}</p>
              <div className="setup-actions no-print">
                <a className="primary" href={`/d/${id}`}>
                  Mở màn hình
                </a>
              </div>
              <p className="quiet">{display}</p>
            </article>
          );
        })}
      </div>
    </main>
  );
}
