"use client";

// CNS point-cloud panel: brain + ventral nerve cord rendered as flickering
// somata, orange = + rate, blue = − rate. Pure canvas, no data leaves the tab.

import { useEffect, useRef } from "react";
import { mulberry32 } from "@/lib/sim";

interface Pt {
  x: number;
  y: number;
  phase: number;
  speed: number;
  bright: boolean;
}

const W = 300;
const H = 200;

function buildPoints(): Pt[] {
  const rng = mulberry32(48271);
  const pts: Pt[] = [];

  const blob = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    n: number,
    wobble: number,
  ) => {
    let placed = 0;
    while (placed < n) {
      const x = cx + (rng() * 2 - 1) * rx * 1.15;
      const y = cy + (rng() * 2 - 1) * ry * 1.15;
      const a = Math.atan2(y - cy, x - cx);
      const warp = 1 + wobble * Math.sin(a * 3 + 1.7) + wobble * 0.6 * Math.sin(a * 7);
      const d = ((x - cx) / (rx * warp)) ** 2 + ((y - cy) / (ry * warp)) ** 2;
      if (d < 1) {
        pts.push({
          x,
          y,
          phase: rng() * Math.PI * 2,
          speed: 0.6 + rng() * 2.6,
          bright: rng() < 0.045,
        });
        placed++;
      }
    }
  };

  // brain: tall two-lobed mass, left of frame
  blob(72, 78, 30, 44, 620, 0.18);
  blob(76, 138, 26, 38, 520, 0.22);
  // ventral nerve cord: horizontal segmented mass, right of frame
  blob(190, 100, 34, 30, 420, 0.2);
  blob(238, 104, 26, 24, 300, 0.2);
  blob(276, 108, 14, 15, 120, 0.25);
  return pts;
}

export default function NeuralActivity({
  drive = 0.5,
}: {
  drive?: number; // 0..1, shifts the orange/blue balance
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const driveRef = useRef(drive);
  driveRef.current = drive;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const pts = buildPoints();
    let raf = 0;
    let t = 0;

    const draw = () => {
      t += 0.016;
      const bias = (driveRef.current - 0.5) * 0.9;
      ctx.fillStyle = "#030402";
      ctx.fillRect(0, 0, W, H);
      for (const p of pts) {
        const v = Math.sin(p.phase + t * p.speed) + bias;
        let fill: string;
        if (p.bright && Math.sin(p.phase * 3 + t * 1.3) > 0.55) {
          fill = "rgba(236,248,255,0.95)";
        } else if (v > 0.3) {
          fill = `rgba(255,140,58,${0.2 + Math.min(v, 1) * 0.6})`;
        } else if (v < -0.3) {
          fill = `rgba(72,150,235,${0.2 + Math.min(-v, 1) * 0.55})`;
        } else {
          fill = "rgba(120,150,170,0.14)";
        }
        ctx.fillStyle = fill;
        ctx.fillRect(p.x, p.y, 1.3, 1.3);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="panel corner">
      <div className="panel-title">
        <strong>CNS</strong>
        <span>/</span>
        <span>NEURAL ACTIVITY</span>
      </div>
      <canvas
        ref={ref}
        style={{ width: "100%", aspectRatio: `${W} / ${H}`, display: "block" }}
      />
      <div className="flex items-center justify-between px-3 pb-2 pt-1 text-[9px] leading-snug text-ink-dim">
        <div>
          Brain
          <br />
          <span className="text-ink-faint">140,024 annotated somata</span>
        </div>
        <div className="text-center">
          <span style={{ color: "var(--orange)" }}>+ rate</span>{" "}
          <span style={{ color: "#4896eb" }}>− rate</span>
        </div>
        <div className="text-right">
          Ventral nerve cord
          <br />
          <span className="text-ink-faint">(model states)</span>
        </div>
      </div>
    </div>
  );
}
