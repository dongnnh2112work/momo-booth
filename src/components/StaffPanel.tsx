"use client";

import { useCallback, useEffect, useState } from "react";

import { BOOTH_IDS } from "@/lib/booths";
import { formatRemain } from "@/lib/format";
import type { StaffPayload } from "@/lib/types";
import { useServerNow } from "./useServerNow";

const KEY_STORAGE = "momo-staff-key";

export function StaffPanel() {
  const [keyInput, setKeyInput] = useState("");
  const [key, setKey] = useState("");
  const [payload, setPayload] = useState<StaffPayload | null>(null);
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const now = useServerNow(payload?.serverNow);

  useEffect(() => {
    const saved = sessionStorage.getItem(KEY_STORAGE);
    if (saved) {
      setKey(saved);
      setKeyInput(saved);
    }
  }, []);

  const pull = useCallback(async (staffKey: string) => {
    const response = await fetch("/api/staff/state", {
      cache: "no-store",
      headers: { "x-staff-key": staffKey },
    });
    if (response.status === 401) {
      setBanner("Sai khóa.");
      setPayload(null);
      return;
    }
    if (!response.ok) {
      setBanner("Không tải được bảng điều phối.");
      return;
    }
    const data = (await response.json()) as StaffPayload;
    setPayload(data);
    setBanner("");
  }, []);

  useEffect(() => {
    if (!key) return;
    let stopped = false;
    const load = () => {
      void pull(key).catch(() => {
        if (!stopped) setBanner("Mất kết nối bảng điều phối.");
      });
    };
    load();
    const id = window.setInterval(load, 2000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [key, pull]);

  async function act(path: string, body: Record<string, string>) {
    if (!key || busy) return;
    setBusy(true);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json", "x-staff-key": key },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setBanner(data.message || "Không thực hiện được.");
        return;
      }
      setBanner(data.message || "Đã cập nhật.");
      await pull(key);
    } catch {
      setBanner("Không gửi được lệnh.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="staff">
      <header className="setup-head">
        <p className="brand">momo</p>
        <h1>Điều phối booth</h1>
        <p>Skip lượt đang chiếu, xoá hàng chờ, hoặc gỡ cooldown khi cần.</p>
      </header>
      <form
        className="key-row"
        onSubmit={(event) => {
          event.preventDefault();
          const next = keyInput.trim();
          sessionStorage.setItem(KEY_STORAGE, next);
          setKey(next);
        }}
      >
        <label htmlFor="staff-key">Khóa điều phối</label>
        <input
          id="staff-key"
          type="password"
          value={keyInput}
          autoComplete="current-password"
          onChange={(event) => setKeyInput(event.target.value)}
        />
        <button type="submit" className="primary">
          Mở bảng
        </button>
      </form>
      {banner ? (
        <p className="banner" role="status">
          {banner}
        </p>
      ) : null}
      {payload ? (
        <div className="staff-grid">
          {BOOTH_IDS.map((id) => {
            const booth = payload.booths[id];
            const spotlight = booth.snapshot.spotlight;
            return (
              <section className="staff-card" key={id}>
                <p className="eyebrow">{booth.snapshot.label}</p>
                <h2>{spotlight ? spotlight.name : "Đang loop"}</h2>
                {spotlight ? (
                  <p className="quiet">
                    {spotlight.code} · còn {formatRemain(spotlight.endsAt - now)} · {spotlight.waitingBehind} người chờ
                  </p>
                ) : (
                  <p className="quiet">Không có ai trên màn hình.</p>
                )}
                <div className="setup-actions">
                  <button type="button" className="primary" disabled={!spotlight || busy} onClick={() => void act("/api/staff/skip", { boothId: id })}>
                    Skip lượt này
                  </button>
                  <button type="button" className="ghost" disabled={busy || booth.snapshot.queue.length === 0} onClick={() => void act("/api/staff/clear", { boothId: id })}>
                    Xoá hàng chờ
                  </button>
                </div>
                <h3>Hàng chờ</h3>
                {booth.snapshot.queue.length === 0 ? (
                  <p className="quiet">Trống.</p>
                ) : (
                  <ol>
                    {booth.snapshot.queue.map((item) => (
                      <li key={item.code}>
                        Số {item.position}: {item.name} ({item.code})
                      </li>
                    ))}
                  </ol>
                )}
                <h3>Cooldown</h3>
                {booth.cooldowns.length === 0 ? (
                  <p className="quiet">Không có.</p>
                ) : (
                  <ul>
                    {booth.cooldowns.map((item) => (
                      <li key={item.code}>
                        <span>
                          {item.name} ({item.code}) · còn {formatRemain(item.until - now)}
                        </span>
                        <button type="button" className="text-btn" disabled={busy} onClick={() => void act("/api/staff/clear-cooldown", { boothId: id, code: item.code })}>
                          Gỡ
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className="ghost" disabled={busy || booth.cooldowns.length === 0} onClick={() => void act("/api/staff/clear-cooldown", { boothId: id })}>
                  Gỡ hết cooldown
                </button>
              </section>
            );
          })}
        </div>
      ) : null}
    </main>
  );
}
