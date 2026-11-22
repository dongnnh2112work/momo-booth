"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { BoothId } from "@/lib/booths-shared";
import { formatClock, formatRemain } from "@/lib/format";
import type { CheckinResponse, CheckinResult, PublicSnapshot, RosterCard } from "@/lib/types";
import { PersonCard } from "./LoopCardMosaic";
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

async function postCheckin(target: BoothId | "shared", code: string, intent: "join" | "resume") {
  const path = target === "shared" ? "/api/checkin" : `/api/booths/${target}/checkin`;
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, clientId: clientId(), intent }),
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
}: {
  boothId?: BoothId;
  label: string;
  title: string;
  shared?: boolean;
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
      const data = await postCheckin(shared ? "shared" : (fixedBooth as BoothId), nextCode, "join");
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
  const screenLabel = snapshot?.label ?? label;

  // The guest's own honor card, as it shows on the TV. Roster cards carry the
  // badge, join year and photo fit; the live snapshot fills in if the roster
  // has not loaded yet.
  const myCard = useMemo<RosterCard | null>(() => {
    if (!session?.code || !live || live.kind === "away") return null;
    const known = channel.roster.find((person) => person.code === session.code);
    if (known) return known;
    if (live.kind === "spotlight") {
      const person = live.person;
      return {
        code: person.code,
        name: person.name,
        department: person.department,
        years: person.years,
        photo: person.photo,
      };
    }
    return null;
  }, [channel.roster, live, session?.code]);

  const showForm = !controlling && !(session?.canControl && live?.kind === "away");

  return (
    <main className="ck">
      <img className="ck__band" src="/card/m16/band.webp" alt="" aria-hidden="true" />
      <img className="ck__podium" src="/card/m16/podium.webp" alt="" aria-hidden="true" />

      <header className="ck__head">
        <img className="ck__logo" src="/card/m16/logo.webp" alt="MoMo M16 · The Power of Small" />
        <h1 className="ck__title">
          <span>{snapshot?.title ?? (shared ? "Vinh danh MoMoer" : title)}</span>
        </h1>
      </header>

      <div className="ck__body">
        <div role="status" aria-live="polite">
          {banner ? <p className="ck__banner">{banner}</p> : null}
        </div>

        {live?.kind === "spotlight" && session?.canControl ? (
          <section className="ck__panel">
            <p className="ck__chip">Đang lên màn {screenLabel}</p>
            {myCard ? (
              <div className="ck__card">
                <PersonCard person={myCard} hires />
              </div>
            ) : null}
            <p className="ck__meta">
              Giữ màn tối đa <b>{formatRemain(live.person.endsAt - now)}</b>
            </p>
            {live.person.waitingBehind > 0 ? (
              <p className="ck__note">
                Có {live.person.waitingBehind} người đang chờ. Chụp xong bấm nút để nhường màn nhé.
              </p>
            ) : null}
            <button type="button" className="ck__btn" onClick={() => void finish()} disabled={!ready || busy}>
              {ready ? "Chụp xong" : `Chụp xong sau ${formatRemain(live.person.minHoldUntil - now)}`}
            </button>
          </section>
        ) : null}

        {live?.kind === "queued" && session?.canControl ? (
          <section className="ck__panel">
            <p className="ck__chip">Chờ lên màn {screenLabel}</p>
            <p className="ck__stat">
              <b>{live.item.position}</b>
              <span>
                số thứ tự
                <br />
                của bạn
              </span>
            </p>
            {myCard ? (
              <div className="ck__card is-waiting">
                <PersonCard person={myCard} />
              </div>
            ) : (
              <p className="ck__hello">Xin chào, {live.item.name}</p>
            )}
            <p className="ck__meta">
              Màn hình đang giữ người phía trước. Trễ nhất <b>{formatClock(live.item.worstCaseEndsAt)}</b> (còn{" "}
              {formatRemain(live.item.worstCaseEndsAt - now)}).
            </p>
          </section>
        ) : null}

        {session?.canControl && live?.kind === "away" ? (
          <section className="ck__panel">
            <p className="ck__hello">Lượt chiếu đã kết thúc.</p>
            <button
              type="button"
              className="ck__btn is-ghost"
              onClick={() => {
                sessionRef.current = null;
                setSession(null);
                setBanner("");
              }}
            >
              Nhập mã khác
            </button>
          </section>
        ) : null}

        {finished && !session ? (
          <section className="ck__panel is-thanks">
            <p className="ck__thanks">
              <span>Thank you for being you!</span>
            </p>
            <p className="ck__meta">Hẹn gặp lại bạn trên vòng lặp của MoMo.</p>
          </section>
        ) : null}

        {showForm ? (
          <form className="ck__panel ck__form" onSubmit={(event) => void onSubmit(event)}>
            <p className="ck__lede">Nhập domain để ảnh của bạn lên đúng màn nhóm năm.</p>
            <label className="ck__label" htmlFor="employee-code">
              Domain
            </label>
            <input
              id="employee-code"
              className="ck__input"
              value={code}
              placeholder="vd. ten.ho (phần trước @momo.vn)"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={busy}
              onChange={(event) => setCode(event.target.value)}
            />
            <button type="submit" className="ck__btn" disabled={busy || code.trim().length === 0}>
              {busy ? "Đang gửi…" : "Tìm dấu ấn của bạn"}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
