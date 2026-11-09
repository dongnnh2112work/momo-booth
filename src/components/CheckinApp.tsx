"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { BOOTHS, type BoothId } from "@/lib/booths";
import { formatClock, formatRemain } from "@/lib/format";
import type { CheckinResponse, CheckinResult, PublicSnapshot } from "@/lib/types";
import { useBoothChannel } from "./useBoothChannel";
import { useServerNow } from "./useServerNow";

function clientId() {
  const key = "momo-client-id";
  const existing = sessionStorage.getItem(key);
  if (existing && /^[A-Za-z0-9-]{8,80}$/.test(existing)) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(key, created);
  return created;
}

async function postCheckin(boothId: BoothId, code: string, intent: "join" | "resume") {
  const response = await fetch(`/api/booths/${boothId}/checkin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, clientId: clientId(), intent }),
    cache: "no-store",
  });
  const data = (await response.json()) as CheckinResponse;
  if (!response.ok || !data.status) throw new Error(data.message || "checkin");
  return data;
}

export function CheckinApp({ boothId }: { boothId: BoothId }) {
  const booth = BOOTHS[boothId];
  const passKey = `momo-pass:${boothId}`;
  const channel = useBoothChannel(boothId);
  const [extra, setExtra] = useState<PublicSnapshot | null>(null);
  const [session, setSession] = useState<CheckinResult | null>(null);
  const [code, setCode] = useState("");
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const sessionRef = useRef<CheckinResult | null>(null);

  const snapshot =
    extra && (!channel.snapshot || extra.revision >= channel.snapshot.revision) ? extra : channel.snapshot;
  const now = useServerNow(snapshot?.serverNow);

  const live = useMemo(() => {
    if (!snapshot || !session?.code) return null;
    if (snapshot.spotlight?.code === session.code) {
      return { kind: "spotlight" as const, person: snapshot.spotlight };
    }
    const queued = snapshot.queue.find((item) => item.code === session.code);
    if (queued) return { kind: "queued" as const, item: queued };
    return { kind: "away" as const };
  }, [snapshot, session]);

  useEffect(() => {
    const raw = sessionStorage.getItem(passKey);
    if (!raw) return;
    let savedCode = "";
    try {
      savedCode = (JSON.parse(raw) as { code?: string }).code ?? "";
    } catch {
      sessionStorage.removeItem(passKey);
      return;
    }
    if (!savedCode) return;
    let stopped = false;
    void postCheckin(boothId, savedCode, "resume")
      .then((data) => {
        if (stopped) return;
        if (data.snapshot) setExtra(data.snapshot);
        if (data.status === "idle") {
          sessionStorage.removeItem(passKey);
          return;
        }
        sessionRef.current = data;
        setSession(data);
        if (data.message) setBanner(data.message);
        if (data.canControl && data.ticket && data.code) {
          sessionStorage.setItem(passKey, JSON.stringify({ code: data.code, ticket: data.ticket }));
        }
      })
      .catch(() => {
        if (!stopped) setBanner("Chưa nối được booth. Thử lại giúp mình.");
      });
    return () => {
      stopped = true;
    };
  }, [boothId, passKey]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextCode = code.trim();
    if (!nextCode || busy) return;
    setBusy(true);
    setFinished(false);
    try {
      const data = await postCheckin(boothId, nextCode, "join");
      if (data.snapshot) setExtra(data.snapshot);
      const current = sessionRef.current;
      if ((data.status === "unknown" || data.status === "wrong_booth") && current?.canControl) {
        setBanner(data.message);
        return;
      }
      sessionRef.current = data;
      setSession(data);
      setBanner(data.message);
      if (data.canControl && data.ticket && data.code) {
        sessionStorage.setItem(passKey, JSON.stringify({ code: data.code, ticket: data.ticket }));
      }
    } catch {
      setBanner("Không gửi được mã. Thử lại giúp mình.");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!session?.ticket || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/booths/${boothId}/done`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticket: session.ticket }),
      });
      const data = (await response.json()) as { ok?: boolean; message?: string; snapshot?: PublicSnapshot };
      if (data.snapshot) setExtra(data.snapshot);
      if (!response.ok || !data.ok) {
        setBanner(data.message || "Chưa thể đóng lượt.");
        return;
      }
      sessionStorage.removeItem(passKey);
      sessionRef.current = null;
      setSession(null);
      setFinished(true);
      setBanner(data.message || "Đã xong. Cảm ơn bạn.");
    } catch {
      setBanner("Không gửi được. Thử lại giúp mình.");
    } finally {
      setBusy(false);
    }
  }

  const controlling = Boolean(session?.canControl && (live?.kind === "spotlight" || live?.kind === "queued"));
  const ready = live?.kind === "spotlight" ? now >= live.person.minHoldUntil : false;

  return (
    <main className="phone-wrap">
      <section className="phone-card">
        <p className="brand">momo</p>
        <p className="eyebrow">{booth.label}</p>
        <h1>{booth.title}</h1>
        <p className="lede">Nhập mã nhân viên để màn hình booth chiếu đúng ảnh của bạn.</p>
        <div role="status" aria-live="polite">
          {banner ? <p className="banner">{banner}</p> : null}
        </div>

        {live?.kind === "spotlight" && session?.canControl ? (
          <div className="status-card">
            <img src={live.person.photo} alt="" className="avatar" />
            <p className="hello">Xin chào, {live.person.name}</p>
            <p className="quiet">{live.person.department}</p>
            <p className="quiet">Giữ tối đa {formatRemain(live.person.endsAt - now)}</p>
            {live.person.waitingBehind > 0 ? (
              <p className="wait-note">
                Có {live.person.waitingBehind} người đang chờ — bấm Chụp xong để nhường màn hình.
              </p>
            ) : null}
            <button type="button" className="primary" onClick={() => void finish()} disabled={!ready || busy}>
              {ready ? "Chụp xong" : `Chụp xong sau ${formatRemain(live.person.minHoldUntil - now)}`}
            </button>
          </div>
        ) : null}

        {live?.kind === "queued" && session?.canControl ? (
          <div className="status-card">
            {live.item.photo ? <img src={live.item.photo} alt="" className="avatar" /> : null}
            <p className="hello">Xin chào, {live.item.name}</p>
            <p className="queue-no">Bạn là số {live.item.position}</p>
            <p className="quiet">
              Màn hình đang giữ người phía trước. Trễ nhất {formatClock(live.item.worstCaseEndsAt)} (còn{" "}
              {formatRemain(live.item.worstCaseEndsAt - now)}).
            </p>
          </div>
        ) : null}

        {session?.canControl && live?.kind === "away" ? (
          <div className="status-card">
            <p className="hello">Lượt chiếu đã kết thúc.</p>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                sessionRef.current = null;
                setSession(null);
                setBanner("");
              }}
            >
              Nhập mã khác
            </button>
          </div>
        ) : null}

        {finished && !session ? <p className="thanks-phone">Cảm ơn bạn. Hẹn gặp lại trên vòng lặp của MoMo.</p> : null}

        {!controlling && !(session?.canControl && live?.kind === "away") ? (
          <form onSubmit={onSubmit}>
            <label htmlFor="employee-code">Mã nhân viên</label>
            <input
              id="employee-code"
              name="code"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              placeholder="VD: A01"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <button type="submit" className="primary" disabled={busy || code.trim().length < 2}>
              {busy ? "Đang gửi…" : "Check in"}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
