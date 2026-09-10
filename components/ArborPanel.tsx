"use client";

// MEASURED FIRING ACTIVITY — the real skeleton arbors of the 27 monitored
// neurons (MaleCNS v1.0, CC-BY 4.0), lit per population by the terminal's
// decoder state. Anatomy is real; on the paper sim the lighting follows
// the simulated rates, as labeled on the panel.

import { useEffect, useRef, useState } from "react";

export interface ArborDrive {
  dnp20L: number; // 0..1
  dnp20R: number;
  gate: boolean;
  pam: boolean;
  ppl: boolean;
  ambient: number; // 0..1
}

interface Neuron {
  group: string;
  side: string;
  body: number;
  pts: [number, number][];
  edges: [number, number][];
}

const COLORS: Record<string, string> = {
  DNp20: "204,245,61",
  DNpe017: "159,212,255",
  PAM11_a1: "0,200,5",
  PPL101_y1pedc: "255,59,92",
  MBON07: "255,140,58",
  MBON11: "180,140,255",
};

const LEGEND: Array<[string, string]> = [
  ["DNp20", "steering"],
  ["DNpe017", "gate"],
  ["PAM11_a1", "profit DA"],
  ["PPL101_y1pedc", "loss DA"],
  ["MBON07", "memory"],
  ["MBON11", "memory"],
];

const W = 300;
const H = 250;

export default function ArborPanel({ drive }: { drive: ArborDrive }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [neurons, setNeurons] = useState<Neuron[] | null>(null);
  const driveRef = useRef(drive);
  driveRef.current = drive;

  useEffect(() => {
    fetch("/arbors.json")
      .then((r) => r.json())
      .then((j) => setNeurons(j.neurons))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !neurons) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // fit projection
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const n of neurons)
      for (const [x, y] of n.pts) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    const s = Math.min((W - 16) / (maxX - minX), (H - 16) / (maxY - minY));
    const ox = (W - (maxX - minX) * s) / 2 - minX * s;
    const oy = (H - (maxY - minY) * s) / 2 - minY * s;
    const px = (p: [number, number]) => [p[0] * s + ox, p[1] * s + oy];

    const strokeNeuron = (
      c: CanvasRenderingContext2D,
      n: Neuron,
      alpha: number,
      width: number,
    ) => {
      c.strokeStyle = `rgba(${COLORS[n.group]},${alpha.toFixed(3)})`;
      c.lineWidth = width;
      c.beginPath();
      for (const [a, b] of n.edges) {
        const [x1, y1] = px(n.pts[a]);
        const [x2, y2] = px(n.pts[b]);
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
      }
      c.stroke();
    };

    // static dim base layer, drawn once
    const base = document.createElement("canvas");
    base.width = W * dpr;
    base.height = H * dpr;
    const bctx = base.getContext("2d")!;
    bctx.scale(dpr, dpr);
    bctx.fillStyle = "#030402";
    bctx.fillRect(0, 0, W, H);
    for (const n of neurons) strokeNeuron(bctx, n, 0.13, 0.6);

    let raf = 0;
    let t = 0;
    const draw = () => {
      t += 0.016;
      const d = driveRef.current;
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(base, 0, 0, W, H);
      for (const n of neurons) {
        let inten = 0;
        if (n.group === "DNp20") inten = n.side === "L" ? d.dnp20L : d.dnp20R;
        else if (n.group === "DNpe017") inten = d.gate ? 0.95 : 0.08;
        else if (n.group === "PAM11_a1") inten = d.pam ? 1 : 0.05;
        else if (n.group === "PPL101_y1pedc") inten = d.ppl ? 1 : 0.05;
        else inten = d.ambient * 0.5;
        if (inten < 0.12) continue;
        const flicker =
          0.75 + 0.25 * Math.sin(t * (3 + (n.body % 5)) + n.body);
        strokeNeuron(ctx, n, Math.min(inten * flicker, 1) * 0.85, 0.9);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [neurons]);

  return (
    <div className="panel corner">
      <div className="panel-title">
        <strong>CNS</strong>
        <span>/</span>
        <span>MEASURED FIRING · 27 ARBORS</span>
      </div>
      <canvas
        ref={ref}
        style={{ width: "100%", aspectRatio: `${W} / ${H}`, display: "block" }}
      />
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 pb-2 pt-1 text-[8px] leading-snug text-ink-faint">
        {LEGEND.map(([g, label]) => (
          <span key={g} className="flex items-center gap-1">
            <span
              className="inline-block h-1.5 w-1.5"
              style={{ background: `rgb(${COLORS[g]})` }}
            />
            {label}
          </span>
        ))}
        <span className="ml-auto">MaleCNS v1.0 skeletons</span>
      </div>
    </div>
  );
}
