"use client";

// Synthesized fly buzz via WebAudio: sawtooth wing-beat fundamental with
// frequency wobble plus filtered noise. No audio files. Browsers require
// a user gesture before sound — the toggle click doubles as that gesture.

import { useCallback, useRef, useState } from "react";

export function useBuzz() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(false);

  const toggle = useCallback(() => {
    setEnabled((e) => {
      const next = !e;
      if (next && !ctxRef.current) {
        ctxRef.current = new AudioContext();
      }
      ctxRef.current?.resume();
      return next;
    });
  }, []);

  const buzz = useCallback(
    (side: "BUY" | "SELL") => {
      const ctx = ctxRef.current;
      if (!enabled || !ctx || ctx.state !== "running") return;
      const t0 = ctx.currentTime;
      const dur = 0.38;

      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      // buys buzz slightly higher than sells; both are still just a fly
      osc.frequency.value = side === "BUY" ? 210 : 160;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 24;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 28;
      lfo.connect(lfoGain).connect(osc.frequency);

      const noise = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buf;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = 900;
      noiseFilter.Q.value = 0.8;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.05;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.03);
      gain.gain.setValueAtTime(0.22, t0 + dur - 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      osc.connect(gain);
      noise.connect(noiseFilter).connect(noiseGain).connect(gain);
      gain.connect(ctx.destination);

      lfo.start(t0);
      osc.start(t0);
      noise.start(t0);
      osc.stop(t0 + dur);
      lfo.stop(t0 + dur);
      noise.stop(t0 + dur);
    },
    [enabled],
  );

  return { buzz, enabled, toggle };
}
