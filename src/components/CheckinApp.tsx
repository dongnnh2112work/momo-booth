"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { BoothId } from "@/lib/booths-shared";
import { formatClock, formatRemain } from "@/lib/format";
import type { CheckinResponse, CheckinResult, PublicSnapshot } from "@/lib/types";
import { useBoothChannel } from "./useBoothChannel";
import { useServerNow } from "./useServerNow";

const memoryStore = new Map<string, string>();

function readStore(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

function writeStore(key: string, value: string) {
  memoryStore.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode keeps the in-memory copy */
  }
}

function removeStore(key: string) {
  memoryStore.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* already gone from memory */
  }
}

function clientId() {
  const key = "momo-client-id";
  const existing = readStore(key);
  if (existing && /^[A-Za-z0-9-]{8,80}$/.test(existing)) return existing;
  const created = crypto.randomUUID();
  writeStore(key, created);
  return created;
}

async function postCheckin(target: BoothId | "shared", code: string, intent: "join" | "resume", pass = "") {
  const path = target === "shared" ? "/api/checkin" : `/api/booths/${target}/checkin`;
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, clientId: clientId(), intent, k: pass }),
    cache: "no-store",
  });
  const data = (await response.json()) as CheckinResponse;
  if (!response.ok || !data.status) throw new Error(data.message || "checkin");
  return data;
}

export function CheckinApp({
  boothId: fixedBooth,
  label,
  title,
  shared = false,
  pass = "",
}: {
  boothId?: BoothId;
  label: string;
  title: string;
  shared?: boolean;
  pass?: string;
}) {
  const passKey = shared ? "momo-pass:shared" : `momo-pass:${fixedBooth}`;
  const [routedBooth, setRoutedBooth] = useState<BoothId | null>(fixedBooth ?? null);
  const boothId = fixedBooth ?? routedBooth;
  const channel = useBoothChannel(boothId);
  const [extra, setExtra] = useState<PublicSnapshot | null>(null);
  const [session, setSession] = useState<CheckinResult | null>(null);
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [code, setCode] = useState("");
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
    const state = snapshot.queueStates?.find((item) => item.code === session.code);
    if (state) {
      return {
        kind: "queued" as const,
        item: {
          code: state.code,
          name: session.name ?? state.code,
          photo: "",
          position: state.position,
          worstCaseEndsAt: state.worstCaseEndsAt,
        },
      };
    }
    return { kind: "away" as const };
  }, [snapshot, session]);

  const liveKind = live?.kind ?? "";
  const previousKind = useRef(liveKind);
  useEffect(() => {
    if (previousKind.current === "queued" && liveKind === "spotlight") setBanner("");
    previousKind.current = liveKind;
  }, [liveKind]);

  useEffect(() => {
    const raw = readStore(passKey);
    if (!raw) return;
    let savedCode = "";
    try {
      savedCode = (JSON.parse(raw) as { code?: string }).code ?? "";
    } catch {
      removeStore(passKey);
      return;
    }
    if (!savedCode) return;
    let stopped = false;
    void postCheckin(shared ? "shared" : (fixedBooth as BoothId), savedCode, "resume")
      .then((data) => {
        if (stopped) return;
        if (data.snapshot?.boothId) setRoutedBooth(data.snapshot.boothId);
        if (data.snapshot) setExtra(data.snapshot);
        if (data.status === "idle") {
          removeStore(passKey);
          return;
        }
        sessionRef.current = data;
        setSession(data);
        if (data.message) setBanner(data.message);
        if (data.canControl && data.ticket && data.code) {
          writeStore(passKey, JSON.stringify({ code: data.code, ticket: data.ticket }));
        }
      })
      .catch(() => {
        if (!stopped) setBanner("Chưa nối được booth. Thử lại giúp mình.");
      });
    return () => {
      stopped = true;
    };
  }, [fixedBooth, passKey, shared]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextCode = code.trim();
    if (!nextCode || busy) return;
    setBusy(true);
    setFinished(false);
    try {
      const data = await postCheckin(shared ? "shared" : (fixedBooth as BoothId), nextCode, "join", pass);
      if (data.snapshot?.boothId) setRoutedBooth(data.snapshot.boothId);
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
        writeStore(passKey, JSON.stringify({ code: data.code, ticket: data.ticket }));
        setCode("");
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
      if (!boothId) return;
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
      removeStore(passKey);
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
        <p className="eyebrow">{snapshot?.label ?? label}</p>
        <h1>{snapshot?.title ?? title}</h1>
        <p className="lede">Nhập mã nhân viên. Ảnh lên đúng màn nhóm năm.</p>
        <div role="status" aria-live="polite">
          {banner ? <p className="banner">{banner}</p> : null}
        </div>

        {live?.kind === "spotlight" && session?.canControl ? (
          <div className="status-card">
            <img src={live.person.photo} alt="" className="avatar" />
            <p className="screen-note">Lên màn {snapshot?.label}</p>
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
            <p className="screen-note">Lên màn {snapshot?.label}</p>
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
          pass ? (
            <form onSubmit={(event) => void onSubmit(event)}>
              <label htmlFor="employee-code">Mã nhân viên</label>
              <input
                id="employee-code"
                value={code}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                disabled={busy}
                onChange={(event) => setCode(event.target.value)}
              />
              <button type="submit" className="primary" disabled={busy || code.trim().length === 0}>
                Check in
              </button>
            </form>
          ) : (
            <p className="banner">Quét QR trên màn hình booth rồi nhập mã nhân viên.</p>
          )
        ) : null}
      </section>
    </main>
  );
}
