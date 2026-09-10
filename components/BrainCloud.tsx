"use client";

// Rotating 3D point-cloud of a two-lobed fly brain, drawn on canvas with a
// hand-rolled perspective projection. Neurons twinkle; a few fire orange.

import { useEffect, useRef } from "react";
import { mulberry32 } from "@/lib/sim";

interface P3 {
  x: number;
  y: number;
  z: number;
  phase: number;
  speed: number;
  hot: boolean;
}

function buildCloud(): P3[] {
  const rng = mulberry32(1337);
  const pts: P3[] = [];
  const lobe = (cx: number, n: number) => {
    let placed = 0;
    while (placed < n) {
      const x = (rng() * 2 - 1) * 1.05;
      const y = (rng() * 2 - 1) * 1.05;
      const z = (rng() * 2 - 1) * 1.05;
      // slightly squashed sphere with wobble = one lobe
      const w = 1 + 0.16 * Math.sin(5 * Math.atan2(y, x)) * Math.cos(3 * z);
      if ((x / (0.62 * w)) ** 2 + (y / (0.8 * w)) ** 2 + (z / (0.66 * w)) ** 2 < 1) {
        pts.push({
          x: x + cx,
          y,
          z,
          phase: rng() * Math.PI * 2,
          speed: 0.4 + rng() * 2.2,
          hot: rng() < 0.06,
        });
        placed++;
      }
    }
  };
  lobe(-0.52, 1500);
  lobe(0.52, 1500);
  return pts;
}

export default function BrainCloud({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.scale(dpr, dpr);

    const pts = buildCloud();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let t = 0;

    const draw = () => {
      t += reduced ? 0 : 0.0035;
      ctx.clearRect(0, 0, cssW, cssH);
      const cos = Math.cos(t);
      const sin = Math.sin(t);
      const scale = Math.min(cssW, cssH) * 0.34;
      for (const p of pts) {
        // rotate around Y
        const rx = p.x * cos - p.z * sin;
        const rz = p.x * sin + p.z * cos;
        const persp = 1.6 / (1.6 + rz * 0.9);
        const sx = cssW / 2 + rx * scale * persp;
        const sy = cssH / 2 + p.y * scale * persp * 0.92;
        const tw = Math.sin(p.phase + t * 60 * p.speed * 0.02);
        const size = Math.max(persp * 1.5, 0.6);
        if (p.hot && tw > 0.86) {
          ctx.fillStyle = "rgba(255,140,58,0.95)";
          ctx.fillRect(sx, sy, size + 0.6, size + 0.6);
        } else {
          const a = (0.1 + 0.26 * Math.max(tw, 0)) * persp;
          ctx.fillStyle = `rgba(204,245,61,${a.toFixed(3)})`;
          ctx.fillRect(sx, sy, size, size);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
