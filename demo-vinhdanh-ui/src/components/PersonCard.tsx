import { useState } from "react";
import type { Guest } from "../data/loadGuests.ts";

type Props = {
  guest: Guest;
  variant?: "full" | "tube";
  className?: string;
};

const FALLBACK_PHOTO = "/portraits/placeholder.png";

const css = `
.pc {
  position: relative;
  width: 428px;
  height: 675px;
  flex-shrink: 0;
  border-radius: 28px;
  overflow: hidden;
  background: linear-gradient(165deg, #fec8dc 0%, #f95396 78%);
  font-family: "MoMo Trust Sans", "Be Vietnam Pro", sans-serif;
  color: #fff;
  box-shadow: 0 18px 40px rgba(80, 8, 40, 0.28);
}
.pc__band {
  position: absolute;
  left: 18px;
  top: 28px;
  width: 34px;
  height: 497px;
  object-fit: fill;
  pointer-events: none;
}
.pc__brand {
  position: absolute;
  left: 8px;
  top: 6px;
  z-index: 5;
  margin: 0;
  width: 92px;
  font-family: "MoMo Trust Display", sans-serif;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.15;
  letter-spacing: 0.01em;
}
.pc__brand span {
  display: block;
  font-family: "MoMo Trust Sans", sans-serif;
  font-size: 9px;
  font-weight: 400;
}
.pc__photo {
  position: absolute;
  left: 28px;
  top: 112px;
  width: 280px;
  height: 430px;
  object-fit: contain;
  object-position: center bottom;
  z-index: 1;
  pointer-events: none;
}
.pc__glow {
  position: absolute;
  left: 24px;
  top: 430px;
  width: 390px;
  height: 110px;
  z-index: 2;
  pointer-events: none;
  background: radial-gradient(ellipse at center, rgba(93, 25, 52, 0.4) 0%, rgba(93, 25, 52, 0) 72%);
}
.pc__stats {
  position: absolute;
  left: 276px;
  top: 158px;
  z-index: 4;
  width: 136px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pc__stat-value {
  margin: 0;
  font-family: "MoMo Trust Display", sans-serif;
  font-size: 22px;
  font-weight: 400;
  line-height: 1;
  color: #fff;
}
.pc__stat-label {
  margin: 2px 0 0;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.15;
  color: #fff;
}
.pc__years {
  position: absolute;
  right: 8px;
  top: 372px;
  z-index: 4;
  margin: 0;
  font-family: "MoMo Trust Display", sans-serif;
  font-size: 96px;
  line-height: 0.8;
  letter-spacing: -0.02em;
}
.pc__years-extrude,
.pc__years-face {
  display: block;
}
.pc__years-extrude {
  position: absolute;
  left: 6px;
  top: 7px;
  color: transparent;
  -webkit-text-stroke: 4px #a50064;
  background-image: repeating-linear-gradient(
    to bottom,
    #a50064 0 2px,
    #ff7eb3 2px 4px
  );
  -webkit-background-clip: text;
  background-clip: text;
  paint-order: stroke fill;
}
.pc__years-face {
  position: relative;
  color: #f95396;
  -webkit-text-stroke: 7px #fff;
  paint-order: stroke fill;
}
.pc__cubes {
  position: absolute;
  left: 188px;
  top: 431px;
  z-index: 3;
  width: 230px;
  height: 94px;
  object-fit: contain;
  pointer-events: none;
}
.pc__ribbon {
  position: absolute;
  left: 108px;
  top: 18px;
  z-index: 5;
  width: 253px;
  height: 84px;
  object-fit: fill;
  pointer-events: none;
}
.pc__tag {
  position: absolute;
  left: 108px;
  top: 18px;
  z-index: 6;
  width: 253px;
  height: 84px;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #f95396;
  font-family: "MoMo Trust Sans", sans-serif;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.15;
}
.pc__footer {
  position: absolute;
  left: 0;
  top: 525px;
  z-index: 6;
  width: 428px;
  height: 150px;
  background: #d9d9d9;
}
.pc__name {
  position: absolute;
  left: 28px;
  top: 538px;
  z-index: 7;
  margin: 0;
  max-width: 270px;
  color: #f95396;
  font-family: "MoMo Trust Display", sans-serif;
  font-size: 26px;
  font-weight: 400;
  white-space: nowrap;
  line-height: 1.05;
}
.pc__star {
  position: absolute;
  left: 26px;
  top: 582px;
  z-index: 7;
  width: 26px;
  height: 26px;
}
.pc__dept {
  position: absolute;
  left: 60px;
  top: 586px;
  z-index: 7;
  margin: 0;
  max-width: 230px;
  color: #222;
  font-family: "MoMo Trust Display", sans-serif;
  font-size: 16px;
  font-weight: 400;
  line-height: 1.2;
}
.pc__cal {
  position: absolute;
  left: 30px;
  top: 620px;
  z-index: 7;
  width: 18px;
  height: 18px;
}
.pc__join {
  position: absolute;
  left: 56px;
  top: 620px;
  z-index: 7;
  margin: 0;
  color: #111;
  font-family: "MoMo Trust Sans", sans-serif;
  font-size: 14px;
  font-weight: 400;
}
.pc__join strong {
  font-family: "MoMo Trust Display", sans-serif;
  font-weight: 400;
}
.pc__qr {
  position: absolute;
  left: 320px;
  top: 582px;
  z-index: 7;
  width: 85px;
  height: 72px;
  border-radius: 3px;
  background: #fff;
  color: #f95396;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: "MoMo Trust Display", sans-serif;
  font-size: 26px;
  font-weight: 400;
}
`;

export function PersonCard({ guest, variant = "full", className }: Props) {
  const [photo, setPhoto] = useState(guest.photoUrl);
  const stats = [
    { value: guest.stat1Value, label: guest.stat1Label },
    { value: guest.stat2Value, label: guest.stat2Label },
    { value: guest.stat3Value, label: guest.stat3Label },
  ];
  const rootClass = ["pc", variant === "full" ? "pc--full" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={rootClass} data-code={guest.code}>
      <style>{css}</style>
      <img className="pc__band" src="/card/band.png" alt="" />
      <p className="pc__brand">
        M16
        <span>Me.We.Impact</span>
      </p>
      <img
        className="pc__photo"
        src={photo}
        alt=""
        onError={() => {
          if (photo !== FALLBACK_PHOTO) setPhoto(FALLBACK_PHOTO);
        }}
      />
      <div className="pc__glow" />
      <div className="pc__stats">
        {stats.map((stat) => (
          <div key={`${stat.value}-${stat.label}`}>
            <p className="pc__stat-value">{stat.value}</p>
            <p className="pc__stat-label">{stat.label}</p>
          </div>
        ))}
      </div>
      <p className="pc__years">
        <span className="pc__years-extrude" aria-hidden="true">
          {guest.years}
        </span>
        <span className="pc__years-face">{guest.years}</span>
      </p>
      <img className="pc__cubes" src="/card/cubes.png" alt="" />
      <img className="pc__ribbon" src="/card/ribbon.png" alt="" />
      <p className="pc__tag">{guest.tag}</p>
      <div className="pc__footer" />
      <p className="pc__name">{guest.name}</p>
      <svg className="pc__star" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#F95396"
          d="M12 2.2 14.7 8.6 21.6 9.3 16.5 14l1.5 6.8L12 17.6 6 20.8 7.5 14 2.4 9.3 9.3 8.6Z"
        />
      </svg>
      <p className="pc__dept">{guest.department}</p>
      <svg className="pc__cal" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="#111" strokeWidth="2" />
        <path d="M3 10h18M8 3v4M16 3v4" fill="none" stroke="#111" strokeWidth="2" />
      </svg>
      <p className="pc__join">
        Năm gia nhập: <strong>{guest.joinYear}</strong>
      </p>
      <div className="pc__qr">QR</div>
    </article>
  );
}
