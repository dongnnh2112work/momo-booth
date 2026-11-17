"use client";

import { useEffect, useRef, useState } from "react";

import { codeFromScan } from "@/lib/codes";

type Detector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

function nativeDetector(): Detector | null {
  const ctor = (globalThis as { BarcodeDetector?: new (options?: { formats?: string[] }) => Detector }).BarcodeDetector;
  if (!ctor) return null;
  try {
    return new ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

export function CodeScanner({
  paused,
  onCode,
}: {
  paused: boolean;
  onCode: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  const [live, setLive] = useState(false);
  const [error, setError] = useState("");
  onCodeRef.current = onCode;

  useEffect(() => {
    if (paused) return;
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let timer = 0;
    const streamBox: { current: MediaStream | null } = { current: null };
    const last = { code: "", at: 0 };

    const stopTracks = () => {
      window.clearInterval(timer);
      for (const track of streamBox.current?.getTracks() ?? []) track.stop();
      streamBox.current = null;
      video.srcObject = null;
    };

    const start = async () => {
      setError("");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        });
        if (stopped) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamBox.current = stream;
        video.srcObject = stream;
        await video.play();
        setLive(true);
        const detector = nativeDetector();
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        let jsQR: ((data: Uint8ClampedArray, width: number, height: number) => { data: string } | null) | null = null;
        if (!detector) {
          const mod = await import("jsqr");
          jsQR = mod.default;
        }
        timer = window.setInterval(() => {
          if (stopped || video.readyState < 2) return;
          const width = video.videoWidth;
          const height = video.videoHeight;
          if (!width || !height) return;
          const read = async () => {
            if (detector) {
              const found = await detector.detect(video);
              return found[0]?.rawValue ?? "";
            }
            if (!context || !jsQR) return "";
            canvas.width = width;
            canvas.height = height;
            context.drawImage(video, 0, 0, width, height);
            const frame = context.getImageData(0, 0, width, height);
            return jsQR(frame.data, width, height)?.data ?? "";
          };
          void read()
            .then((raw) => {
              const code = codeFromScan(raw);
              if (!code || stopped) return;
              const now = Date.now();
              if (code === last.code && now - last.at < 4000) return;
              last.code = code;
              last.at = now;
              onCodeRef.current(code);
            })
            .catch(() => undefined);
        }, 280);
      } catch {
        if (!stopped) setError("Chưa mở được camera. Cho phép camera rồi quét lại.");
      }
    };

    void start();
    return () => {
      stopped = true;
      setLive(false);
      stopTracks();
    };
  }, [paused]);

  return (
    <div className="scan-stage">
      <video ref={videoRef} playsInline muted autoPlay />
      <p className="scan-stage__hint">{error || (live ? "Đưa QR mã nhân viên vào khung" : "Đang mở camera…")}</p>
    </div>
  );
}
