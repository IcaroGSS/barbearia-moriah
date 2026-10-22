import { useState } from "react";

type Point = { label: string; value: number; tip: string };

/** Barras verticais de uma série só (cor de destaque do tema), com tooltip ao passar o mouse/tocar. */
export function BarChart({ data, height = 180, ariaLabel }: { data: Point[]; height?: number; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const pad = { t: 12, r: 8, b: 22, l: 8 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = (W - pad.l - pad.r) / Math.max(1, data.length);
  const bw = Math.max(2, Math.min(36, slot - 2));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const base = H - pad.b;
  const showEvery = data.length > 16 ? Math.ceil(data.length / 10) : 1;

  return (
    <div style={{ position: "relative" }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {[0.5, 1].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="rgba(255,255,255,0.08)" />
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={base} y2={base} stroke="rgba(255,255,255,0.18)" />
        {data.map((d, i) => {
          const x = pad.l + i * slot + (slot - bw) / 2;
          const top = y(d.value);
          const h = Math.max(0, base - top);
          const r = Math.min(4, bw / 2, h);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              {/* área de toque maior que a barra */}
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={base - pad.t} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${base} Z`}
                  fill="var(--accent)"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {i % showEvery === 0 && (
                <text x={x + bw / 2} y={H - 6} textAnchor="middle">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="glass small"
          style={{
            position: "absolute",
            top: 0,
            left: `${Math.min(80, Math.max(0, ((hover + 0.5) / data.length) * 100 - 10))}%`,
            padding: "6px 10px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          {data[hover].tip}
        </div>
      )}
    </div>
  );
}

/** Barras horizontais para rankings (serviços mais vendidos, horários de pico). */
export function HBars({ data, format = (v: number) => String(v) }: { data: { label: string; value: number; extra?: string }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <div className="muted small">Sem dados no período.</div>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {data.map((d) => (
        <div key={d.label} title={`${d.label}: ${format(d.value)}${d.extra ? ` · ${d.extra}` : ""}`}>
          <div className="row between small">
            <span>{d.label}</span>
            <span className="muted">
              {format(d.value)}
              {d.extra ? ` · ${d.extra}` : ""}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
            <div style={{ width: `${(d.value / max) * 100}%`, height: "100%", borderRadius: 4, background: "var(--accent)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
