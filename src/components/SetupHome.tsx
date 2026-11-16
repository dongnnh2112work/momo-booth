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
      const image = await QR.toDataURL(`${origin}/c`, {
        margin: 1,
        width: 560,
        errorCorrectionLevel: "M",
        color: { dark: "#4c1232", light: "#ffffff" },
      });
      if (!cancelled) setCodes({ shared: image });
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
          Một QR cho cả hai màn. Khách nhập mã, hệ thống tự đưa ảnh lên màn đúng nhóm năm. Mỗi TV mở đúng link màn
          hình của mình. Điện thoại và máy chiếu cần vào cùng địa chỉ này.
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
      <article className="qr-card qr-card-shared">
        <p className="eyebrow">Một QR</p>
        <h2>Check-in</h2>
        <p>Quét mã và nhập mã nhân viên. Hệ thống xếp vào màn 5 năm hoặc màn 5 và 10 năm.</p>
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
              <p className="quiet">Mã thử {booth.sample}</p>
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
