const COLS = 8;
const ROWS = 12;
const ENTER_MS = 1800;
const EXIT_MS = 1350;

export type RevealPhase = "loop" | "reveal";

type Cell = {
  col: number;
  row: number;
  jitterX: number;
  jitterY: number;
  drift: number;
  personIndex: number;
  nextSwap: number;
};

type EnginePhase = "loop" | "enter" | "hold" | "exit" | "swap";

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function ease(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - ((-2 * value + 2) ** 3) / 2;
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const source = image as HTMLImageElement;
  const iw = source.width || (image as HTMLCanvasElement).width;
  const ih = source.height || (image as HTMLCanvasElement).height;
  if (!iw || !ih || dw <= 0 || dh <= 0) return;
  const scale = Math.max(dw / iw, dh / ih);
  const sw = dw / scale;
  const sh = dh / scale;
  context.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, dx, dy, dw, dh);
}

export function createDisplayEngine(
  canvas: HTMLCanvasElement,
  onPhase: (phase: RevealPhase) => void,
) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const enterMs = reduced ? 1 : ENTER_MS;
  const exitMs = reduced ? 1 : EXIT_MS;
  const parent = canvas.parentElement ?? canvas;
  const cells: Cell[] = [];
  let seed = 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      cells.push({
        col,
        row,
        jitterX: rand() - 0.5,
        jitterY: rand() - 0.5,
        drift: rand() * Math.PI * 2,
        personIndex: Math.floor(rand() * 1000),
        nextSwap: 0,
      });
    }
  }

  const cache = new Map<string, HTMLImageElement>();
  const loading = new Map<string, Promise<HTMLImageElement>>();
  let rosterImages: HTMLImageElement[] = [];
  let heroImg: HTMLImageElement | null = null;
  let pendingImg: HTMLImageElement | null = null;
  let shownCode: string | null = null;
  let targetCode: string | null = null;
  let phase: EnginePhase = "loop";
  let phaseStart = 0;
  let fromAssemble = 0;
  let assemble = 0;
  let swapped = false;
  let requestId = 0;
  let reported: RevealPhase = "loop";
  let width = 0;
  let height = 0;
  let dpr = 1;
  let sheet: HTMLCanvasElement | null = null;
  let sheetKey = "";
  let frame = 0;
  let running = false;

  function report(next: RevealPhase) {
    if (reported === next) return;
    reported = next;
    onPhase(next);
  }

  function load(url: string) {
    const cached = cache.get(url);
    if (cached?.complete && cached.naturalWidth > 0) return Promise.resolve(cached);
    const pending = loading.get(url);
    if (pending) return pending;
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = cached ?? new Image();
      image.onload = () => {
        cache.set(url, image);
        resolve(image);
      };
      image.onerror = () => reject(new Error(url));
      if (!cached) image.src = url;
    });
    loading.set(url, promise);
    return promise;
  }

  function begin(next: EnginePhase) {
    phase = next;
    phaseStart = performance.now();
    fromAssemble = assemble;
    if (next === "enter" || next === "swap" || next === "exit") report("loop");
  }

  function resize() {
    const rect = parent.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    sheetKey = "";
  }

  const observer = new ResizeObserver(() => resize());
  observer.observe(parent);

  function layout() {
    let pw = width * 0.78;
    let ph = pw * (ROWS / COLS);
    const maxH = height * 0.84;
    if (ph > maxH) {
      ph = maxH;
      pw = ph * (COLS / ROWS);
    }
    return { px: (width - pw) / 2, py: height * 0.07, pw, ph };
  }

  function ensureSheet(image: HTMLImageElement, pw: number, ph: number) {
    const key = `${image.src}|${Math.round(pw * dpr)}|${Math.round(ph * dpr)}`;
    if (sheet && sheetKey === key) return sheet;
    const next = document.createElement("canvas");
    next.width = Math.max(1, Math.round(pw * dpr));
    next.height = Math.max(1, Math.round(ph * dpr));
    const context = next.getContext("2d");
    if (context) drawCover(context, image, 0, 0, next.width, next.height);
    sheet = next;
    sheetKey = key;
    return next;
  }

  function advance(time: number) {
    const elapsed = time - phaseStart;
    if (phase === "enter") {
      const progress = clamp(elapsed / enterMs);
      assemble = fromAssemble + (1 - fromAssemble) * ease(progress);
      if (progress >= 1) {
        assemble = 1;
        phase = "hold";
        report("reveal");
      }
      return;
    }
    if (phase === "exit") {
      const progress = clamp(elapsed / exitMs);
      assemble = fromAssemble * (1 - ease(progress));
      if (progress >= 1) {
        assemble = 0;
        phase = "loop";
        shownCode = null;
        heroImg = null;
        report("loop");
      }
      return;
    }
    if (phase === "swap") {
      const progress = clamp(elapsed / enterMs);
      if (progress < 0.42) {
        const local = ease(progress / 0.42);
        assemble = fromAssemble + (0.12 - fromAssemble) * local;
      } else {
        if (!swapped) {
          swapped = true;
          heroImg = pendingImg;
          shownCode = targetCode;
          sheetKey = "";
        }
        assemble = 0.12 + 0.88 * ease((progress - 0.42) / 0.58);
      }
      if (progress >= 1) {
        assemble = 1;
        phase = "hold";
        report("reveal");
      }
    }
  }

  function draw(time: number) {
    const context = canvas.getContext("2d");
    if (!context || width < 2 || height < 2) return;
    advance(time);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const rect = layout();
    if (assemble > 0.02) {
      context.save();
      context.globalAlpha = 0.3 * assemble;
      context.fillStyle = "#ffffff";
      roundRect(context, rect.px - 14, rect.py - 14, rect.pw + 28, rect.ph + 28, 28);
      context.fill();
      context.restore();
    }

    const marginX = width * 0.05;
    const marginY = height * 0.055;
    const gridW = width - marginX * 2;
    const gridH = height - marginY * 2;
    const cellW = gridW / COLS;
    const cellH = gridH / ROWS;
    const loopSize = Math.min(cellW, cellH) * 0.74;
    const homeW = rect.pw / COLS;
    const homeH = rect.ph / ROWS;
    const gap = assemble > 0.92 ? 0 : 2;
    const heroSheet = heroImg ? ensureSheet(heroImg, rect.pw, rect.ph) : null;
    const slice = assemble <= 0.35 ? 0 : assemble >= 0.85 ? 1 : (assemble - 0.35) / 0.5;
    const driftAmp = 8 * (1 - assemble);

    for (const cell of cells) {
      if (assemble < 0.2 && rosterImages.length > 1 && time > cell.nextSwap) {
        cell.personIndex = (cell.personIndex + 1) % rosterImages.length;
        cell.nextSwap = time + 3900 + cell.row * 240 + cell.col * 105;
      }
      const size = loopSize;
      const loopX =
        marginX +
        cell.col * cellW +
        (cellW - size) / 2 +
        cell.jitterX * cellW * 0.7 +
        Math.sin(time / 2100 + cell.drift) * driftAmp;
      const loopY =
        marginY +
        cell.row * cellH +
        (cellH - size) / 2 +
        cell.jitterY * cellH * 0.7 +
        Math.cos(time / 2550 + cell.drift) * driftAmp;
      const homeX = rect.px + cell.col * homeW + gap / 2;
      const homeY = rect.py + cell.row * homeH + gap / 2;
      const x = loopX + (homeX - loopX) * assemble;
      const y = loopY + (homeY - loopY) * assemble;
      const dw = size + (homeW - gap - size) * assemble;
      const dh = size + (homeH - gap - size) * assemble;
      if (dw < 1 || dh < 1) continue;

      context.save();
      roundRect(context, x, y, dw, dh, 10 * (1 - assemble));
      context.clip();
      context.fillStyle = "rgba(255,255,255,0.22)";
      context.fillRect(x, y, dw, dh);
      const mini = rosterImages.length > 0 ? rosterImages[cell.personIndex % rosterImages.length] : null;
      if (mini && slice < 1) {
        context.globalAlpha = 1 - slice;
        drawCover(context, mini, x, y, dw, dh);
      }
      if (heroSheet && slice > 0) {
        context.globalAlpha = slice;
        const sw = heroSheet.width / COLS;
        const sh = heroSheet.height / ROWS;
        context.drawImage(heroSheet, cell.col * sw, cell.row * sh, sw, sh, x, y, dw, dh);
      }
      context.restore();
    }

    if (heroImg && assemble > 0.84) {
      const fade = Math.min(1, (assemble - 0.84) / 0.16);
      context.save();
      context.beginPath();
      context.rect(rect.px, rect.py, rect.pw, rect.ph * 0.76);
      context.clip();
      context.globalAlpha = fade;
      drawCover(context, heroImg, rect.px, rect.py, rect.pw, rect.ph);
      context.restore();
    }
  }

  function frameLoop(time: number) {
    if (!running) return;
    frame = window.requestAnimationFrame(frameLoop);
    draw(time);
  }

  return {
    setRoster(photos: string[]) {
      void Promise.all(photos.filter(Boolean).map((url) => load(url).catch(() => null))).then((images) => {
        rosterImages = images.filter((image): image is HTMLImageElement => image !== null);
      });
    },
    setSpotlight(code: string | null, photo: string | null) {
      if (!code || !photo) {
        requestId += 1;
        targetCode = null;
        if (phase === "loop" && assemble < 0.02) {
          shownCode = null;
          heroImg = null;
          return;
        }
        begin("exit");
        return;
      }
      if (code === targetCode && (phase === "enter" || phase === "hold" || phase === "swap")) return;
      const token = ++requestId;
      targetCode = code;
      void load(photo)
        .then((image) => {
          if (token !== requestId) return;
          if (shownCode && heroImg && shownCode !== code && assemble > 0.35) {
            pendingImg = image;
            swapped = false;
            begin("swap");
            return;
          }
          heroImg = image;
          pendingImg = image;
          shownCode = code;
          sheetKey = "";
          begin("enter");
        })
        .catch(() => {
          if (token !== requestId) return;
          heroImg = null;
          shownCode = code;
          begin("enter");
        });
    },
    start() {
      if (running) return;
      running = true;
      resize();
      frame = window.requestAnimationFrame(frameLoop);
    },
    stop() {
      running = false;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    },
  };
}
