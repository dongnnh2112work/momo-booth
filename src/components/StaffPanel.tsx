"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { BoothId } from "@/lib/booths-shared";
import { FALLBACK_POLL_MS } from "@/lib/timing";
import { formatRemain } from "@/lib/format";
import type { StaffPayload } from "@/lib/types";
import { useServerNow } from "./useServerNow";

const KEY_STORAGE = "momo-staff-key";

export function StaffPanel({ boothIds }: { boothIds: BoothId[] }) {
  const [keyInput, setKeyInput] = useState("");
  const [key, setKey] = useState("");
  const [payload, setPayload] = useState<StaffPayload | null>(null);
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [manualNote, setManualNote] = useState<{ boothId: BoothId; message: string } | null>(null);
  const now = useServerNow(payload?.serverNow);

  useEffect(() => {
    const saved = sessionStorage.getItem(KEY_STORAGE);
    if (saved) {
      setKey(saved);
      setKeyInput(saved);
    }
  }, []);

  const etagRef = useRef<string | null>(null);

  const pull = useCallback(async (staffKey: string) => {
    const headers: Record<string, string> = { "x-staff-key": staffKey };
    if (etagRef.current) headers["If-None-Match"] = etagRef.current;
    const response = await fetch("/api/staff/state", {
      cache: "no-store",
      headers,
    });
    if (response.status === 304) {
      setBanner("");
      return;
    }
    if (response.status === 401) {
      setBanner("Sai khóa.");
      setPayload(null);
      etagRef.current = null;
      return;
    }
    if (!response.ok) {
      setBanner("Không tải được bảng điều phối.");
      return;
    }
    const nextTag = response.headers.get("ETag");
    if (nextTag) etagRef.current = nextTag;
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
    const id = window.setInterval(load, FALLBACK_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [key, pull]);

  async function downloadState() {
    if (!key || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/staff/export", {
        cache: "no-store",
        headers: { "x-staff-key": key },
      });
      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        setBanner(data.message || "Không tải được trạng thái.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "live-state.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setBanner("Đã tải trạng thái.");
    } catch {
      setBanner("Không gửi được lệnh.");
    } finally {
      setBusy(false);
    }
  }

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

  async function manualCheckIn(boothId: BoothId) {
    const code = (codes[boothId] ?? "").trim();
    if (!key || busy) return;
    if (!code) {
      const message = "Nhập mã.";
      setManualNote({ boothId, message });
      setBanner(message);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/staff/manual-checkin", {
        method: "POST",
        headers: { "content-type": "application/json", "x-staff-key": key },
        body: JSON.stringify({ boothId, code }),
      });
      const data = (await response.json()) as { message?: string };
      const message = data.message || (response.ok ? "Đã cập nhật." : "Không thực hiện được.");
      if (response.ok) {
        setCodes((current) => ({ ...current, [boothId]: "" }));
        try {
          await pull(key);
        } catch {
          setManualNote({ boothId, message: "Mất kết nối bảng điều phối." });
          setBanner("Mất kết nối bảng điều phối.");
          return;
        }
      }
      setManualNote({ boothId, message });
      setBanner(message);
    } catch {
      const message = "Không gửi được lệnh.";
      setManualNote({ boothId, message });
      setBanner(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="staff">
      <header className="setup-head">
        <p className="brand">momo</p>
        <h1>Điều phối booth</h1>
        <p>Nhập mã để đưa vào hàng chờ, skip lượt đang chiếu, xoá hàng chờ, hoặc gỡ cooldown khi cần.</p>
        {payload ? (
          <div className="setup-actions">
            <button type="button" className="ghost" disabled={busy} onClick={() => void downloadState()}>
              Tải trạng thái
            </button>
          </div>
        ) : null}
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
          {boothIds.map((id) => {
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
                <form
                  className="manual-entry"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void manualCheckIn(id);
                  }}
                >
                  <label htmlFor={`manual-code-${id}`}>Nhập mã</label>
                  <input
                    id={`manual-code-${id}`}
                    value={codes[id] ?? ""}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    disabled={busy}
                    onChange={(event) => setCodes((current) => ({ ...current, [id]: event.target.value }))}
                  />
                  <button type="submit" className="primary" disabled={busy}>
                    Nhập mã
                  </button>
                </form>
                {manualNote?.boothId === id ? (
                  <p className="banner" role="status">
                    {manualNote.message}
                  </p>
                ) : null}
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
