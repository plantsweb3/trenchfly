"use client";

import { useEffect, useState } from "react";
import FlySvg from "./FlySvg";
import BrainCloud from "./BrainCloud";
import { FLY_WALLET, ROBINHOOD_CHAIN } from "@/lib/chain";

const CHIPS = [
  ["166,700", "NEURONS"],
  ["25.6M", "CONNECTIONS"],
  ["$100", "BANKROLL"],
  ["3", "LAUNCHPADS"],
];

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
        className="pointer-events-none absolute inset-x-0 top-[8%] h-[55%]"
        style={{
          background:
            "radial-gradient(ellipse 50% 55% at 50% 45%, rgba(204,245,61,0.10), transparent 70%)",
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
          <div className="mt-1 text-ink-faint">CHAIN 4663 · GAS ETH</div>
        </div>
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-5 text-center">
        {/* the brain, floating above its body */}
        <div className="anim-rise relative -mb-6 h-[190px] w-[340px] sm:h-[230px] sm:w-[440px]">
          <BrainCloud className="h-full w-full" />
          {/* control link: brain → fly */}
          <svg
            className="absolute -bottom-10 left-1/2 h-12 w-4 -translate-x-1/2"
            viewBox="0 0 8 48"
            aria-hidden="true"
          >
            <line
              x1="4"
              y1="0"
              x2="4"
              y2="48"
              stroke="#ccf53d"
              strokeWidth="1"
              strokeDasharray="2 5"
              opacity="0.6"
            >
              <animate
                attributeName="stroke-dashoffset"
                from="0"
                to="-14"
                dur="0.9s"
                repeatCount="indefinite"
              />
            </line>
          </svg>
        </div>

        <div
          className="anim-rise w-[260px] max-w-[68vw] sm:w-[330px]"
          style={{ animationDelay: "0.1s" }}
        >
          <FlySvg className="block w-full" />
        </div>

        <h1
          className="anim-rise mt-1 text-4xl leading-none text-ink sm:text-6xl md:text-7xl"
          style={{
            fontFamily: "var(--font-pixel)",
            animationDelay: "0.2s",
            textShadow:
              "0 0 28px rgba(204,245,61,0.4), 0 0 2px rgba(204,245,61,0.8)",
          }}
        >
          TRENCH<span className="text-lime">FLY</span>
        </h1>

        <p
          className="anim-rise mt-4 max-w-xl text-sm leading-relaxed text-ink-dim sm:text-[15px]"
          style={{ animationDelay: "0.3s", fontFamily: "var(--font-plex-sans)" }}
        >
          I gave a fly brain <span className="text-ink">$100</span> and an EVM
          wallet to trade memecoin launches on Robinhood Chain. Dopamine
          neurons fire when it profits. Motor neurons sign the orders. No exit
          strategy — which makes it better prepared for the trenches than most
          participants.
        </p>

        {/* stat chips */}
        <div
          className="anim-rise mt-6 flex flex-wrap items-stretch justify-center gap-2"
          style={{ animationDelay: "0.4s" }}
        >
          {CHIPS.map(([v, k]) => (
            <div
              key={k}
              className="border border-line bg-panel/70 px-3 py-1.5 text-left"
            >
              <div className="text-sm font-semibold text-lime">{v}</div>
              <div className="text-[8px] tracking-[0.25em] text-ink-faint">
                {k}
              </div>
            </div>
          ))}
        </div>

        <div
          className="anim-rise mt-7 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "0.5s" }}
        >
          <a
            href="#terminal"
            className="border border-lime bg-lime px-6 py-3 text-[11px] font-bold tracking-[0.3em] text-black transition-all hover:bg-transparent hover:text-lime"
          >
            WATCH THE FLY TRADE ▾
          </a>
          {FLY_WALLET && (
            <a
              href={`${ROBINHOOD_CHAIN.explorer}/address/${FLY_WALLET}`}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-line-bright px-6 py-3 text-[11px] font-bold tracking-[0.3em] text-ink-dim transition-colors hover:border-lime hover:text-lime"
            >
              VERIFY THE WALLET ↗
            </a>
          )}
        </div>
      </div>

      <div className="relative z-10 pb-4 text-center text-[9px] tracking-[0.3em] text-ink-faint">
        PAPER SESSION · CHAIN 4663 · EVERY ORDER STARTS AS SPIKES · THE FLY
        DOES NOT KNOW
      </div>
    </header>
  );
}
