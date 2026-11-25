"use client";

import { useRef, useState } from "react";
import { ACCEPT } from "@/lib/load";

/** Positions are in the photo's own 960 × 720 frame, traced from the picture. */
const NOZZLES = [320, 410, 500, 590, 680];
const surfaceY = (x: number) => 430 + (x - 262) * 0.03;
const DETECTORS = [300, 450, 600, 715];

const STEPS = [
  "Grease on the line catches fire",
  "A fusible link over the line melts",
  "The release fires; agent runs down the pipe",
  "Every nozzle sprays its hazard at once",
  "The agent turns the hot oil to a soapy blanket",
  "Gas to the line is shut off",
];

interface Props {
  onFile: (f: File) => void;
  onExamples: () => void;
  busy: boolean;
  error: string | null;
}

export default function Hero({ onFile, onExamples, busy, error }: Props) {
  const [pct, setPct] = useState(56);
  const [firing, setFiring] = useState(0); // a counter restarts the CSS timeline
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const fig = useRef<HTMLDivElement>(null);

  const fire = () => {
    setPct(100);
    setFiring((n) => n + 1);
  };

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <h1 id="hero-title" className="hero-title">
          Check the line before service.
        </h1>
        <p className="hero-lede">
          Drop a kitchen plan, draw the hood and the appliances over it, and Line Check works out the nozzles, flow numbers, tanks and
          detectors from the published design limits. You get the checks, a design sheet and a DXF to put back in the drawing.
        </p>

        <div
          className={`drop${over ? " is-over" : ""}${busy ? " is-busy" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
        >
          <p className="drop-title">{busy ? "Reading the drawing…" : "Drop a DWG, DXF, PDF or picture here"}</p>
          <p className="drop-sub">It is read in your browser. Nothing is uploaded unless you ask for an AI suggestion.</p>
          <div className="drop-actions">
            <button type="button" className="btn primary" onClick={() => input.current?.click()} disabled={busy}>
              Choose a file
            </button>
            <button type="button" className="btn" onClick={onExamples}>
              Start from an example
            </button>
          </div>
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          <p className={error ? "msg is-error" : "msg"} role={error ? "alert" : undefined}>
            {error ?? ""}
          </p>
        </div>
      </div>

      <figure className="xray">
        <div
          ref={fig}
          className="xray-frame"
          onPointerMove={(e) => {
            if (e.pointerType !== "mouse" || firing) return;
            const r = fig.current!.getBoundingClientRect();
            setPct(Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100))));
          }}
        >
          <svg key={firing} viewBox="0 0 960 720" className={`xray-svg${firing ? " is-firing" : ""}`} role="img" aria-label="A kitchen island under a stainless hood. The right part shows, drawn over the photo, the suppression pipe, nozzles and detection line.">
            <defs>
              <clipPath id="xray-clip">
                <rect x="0" y="0" width={(960 * pct) / 100} height="720" className="xray-clip" />
              </clipPath>
            </defs>
            <image href="/photos/kitchen-island.jpg" x="0" y="0" width="960" height="720" preserveAspectRatio="xMidYMid slice" />
            <g clipPath="url(#xray-clip)">
              <rect width="960" height="720" className="xr-tint" />
              <polygon points="392,150 456,154 456,268 392,264" className="xr-duct" />
              <polygon points="262,258 737,276 737,338 262,347" className="xr-hood" />
              <rect x="140" y="322" width="34" height="70" className="xr-tank" />
              <path d="M157 322 V300 H262 L730 304" className="xr-pipe" pathLength={1} />
              <path d="M174 360 H190 V286 L715 292" className="xr-cable" />
              {DETECTORS.map((x, i) => (
                <rect key={x} x={x - 5} y={281 + (x - 262) * 0.012} width="10" height="10" className={`xr-det${i === 0 ? " first" : ""}`} />
              ))}
              {NOZZLES.map((x, i) => {
                const y0 = 300 + (x - 262) * 0.009;
                const ys = surfaceY(x);
                return (
                  <g key={x} className="xr-noz" style={{ ["--i" as string]: i }}>
                    <line x1={x} x2={x} y1={y0} y2={350} className="xr-drop" />
                    <polygon points={`${x},352 ${x - 40},${ys} ${x + 40},${ys}`} className="xr-cone" />
                    <path d={`M${x - 5} 346 h10 l-5 7z`} className="xr-tip" />
                    <path d={`M${x - 13} ${ys} q4 -26 13 -38 q9 12 13 38z`} className="xr-flame" />
                    <rect x={x - 38} y={ys - 7} width="76" height="8" rx="4" className="xr-foam" />
                  </g>
                );
              })}
              <g className="xr-labels">
                <text x="270" y="250">Hood and plenum</text>
                <text x="120" y="412">Tank</text>
                <text x="560" y="270">Detection line</text>
                <text x="300" y="530">Nozzles over each hazard</text>
                <text x="190" y="470" className="xr-gas">Gas off</text>
              </g>
            </g>
            <line x1={(960 * pct) / 100} x2={(960 * pct) / 100} y1="0" y2="720" className="xray-edge" />
          </svg>
        </div>
        <div className="xray-controls">
          <label className="xray-range">
            <span>X-ray</span>
            <input type="range" min={0} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} aria-label="How much of the photo shows the suppression system" />
          </label>
          <button type="button" className="btn" onClick={fire}>
            {firing ? "Run it again" : "Run a discharge"}
          </button>
        </div>
        {firing > 0 && (
          <ol key={firing} className="steps" aria-label="What happens in a discharge">
            {STEPS.map((s, i) => (
              <li key={s} style={{ ["--d" as string]: `${[0, 1.2, 1.7, 2.6, 3.4, 4.6][i]}s` }}>
                {s}
              </li>
            ))}
          </ol>
        )}
        <figcaption className="credit-line">
          Photo: kitchen at CIA at Copia, by Shrinks99, CC0, via Wikimedia Commons. The system drawn over it is illustrative.
        </figcaption>
      </figure>
    </section>
  );
}
