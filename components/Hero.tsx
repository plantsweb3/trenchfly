"use client";

import { useEffect, useState } from "react";
import FlySvg from "./FlySvg";

export default function Hero() {
  const [spikes, setSpikes] = useState(1_230_000);

  useEffect(() => {
    const id = setInterval(
      () => setSpikes((s) => s + 40_000 + Math.floor(Math.random() * 30_000)),
      600,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <header className="scanlines relative flex min-h-svh flex-col overflow-hidden">
      <div className="city-dots" />
      <div className="grid-floor" />
      <div
        className="pointer-events-none absolute inset-x-0 top-[18%] h-[45%]"
        style={{
          background:
            "radial-gradient(ellipse 55% 60% at 50% 50%, rgba(204,245,61,0.09), transparent 70%)",
        }}
      />
      <div className="vignette" />

      {/* HUD corners */}
      <div className="relative z-10 flex items-start justify-between px-5 pt-5 text-[9px] tracking-[0.25em] text-ink-dim sm:text-[10px]">
        <div>
          <span className="anim-blink mr-2 inline-block h-2 w-2 bg-red align-middle" />
          NEURAL REPLAY · LIVE
          <div className="mt-1 text-lime">
            {(spikes / 1e6).toFixed(2)}M SPIKES
          </div>
        </div>
        <div className="text-right">
          MaleCNS v1.0
          <div className="mt-1 text-ink-faint">
            166,700 NEURONS · 25.6M CONNECTIONS
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-5 text-center">
        <div className="anim-rise w-[280px] max-w-[70vw] sm:w-[360px]">
          <FlySvg className="block w-full" />
        </div>

        <h1
          className="anim-rise mt-2 text-4xl leading-none text-ink sm:text-6xl md:text-7xl"
          style={{
            fontFamily: "var(--font-pixel)",
            animationDelay: "0.15s",
            textShadow:
              "0 0 24px rgba(204,245,61,0.35), 0 0 2px rgba(204,245,61,0.8)",
          }}
        >
          TRENCH<span className="text-lime">FLY</span>
        </h1>

        <p
          className="anim-rise mt-5 max-w-xl text-sm leading-relaxed text-ink-dim sm:text-base"
          style={{ animationDelay: "0.3s", fontFamily: "var(--font-plex-sans)" }}
        >
          I gave a fly brain <span className="text-ink">$100</span> and an EVM
          wallet to trade memecoin launches on Robinhood Chain. It watches Pons,
          long.xyz and o1. Dopamine neurons fire when it profits. Motor neurons
          sign the orders. It has 166,700 neurons and no concept of an exit
          strategy, which makes it better prepared for the trenches than most
          participants.
        </p>

        <a
          href="#terminal"
          className="anim-rise mt-8 border border-lime px-6 py-3 text-[11px] font-bold tracking-[0.3em] text-lime transition-colors hover:bg-lime hover:text-black"
          style={{ animationDelay: "0.45s" }}
        >
          WATCH THE FLY TRADE ▾
        </a>
      </div>

      <div className="relative z-10 pb-4 text-center text-[9px] tracking-[0.3em] text-ink-faint">
        PAPER SESSION · CHAIN 4663 · WALLET PENDING · THE FLY DOES NOT KNOW
      </div>
    </header>
  );
}
