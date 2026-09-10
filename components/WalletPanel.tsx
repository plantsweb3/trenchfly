"use client";

import { useEffect, useState } from "react";
import { ROBINHOOD_CHAIN, shortAddr } from "@/lib/chain";

interface WalletInfo {
  address: string | null;
  balanceEth: number | null;
}

export default function WalletPanel() {
  const [info, setInfo] = useState<WalletInfo | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/wallet")
        .then((r) => r.json())
        .then((j) => alive && setInfo(j))
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="panel corner">
      <div className="panel-title">
        <strong>FLY WALLET</strong>
        <span>/</span>
        <span>EVM · CHAIN 4663</span>
      </div>
      <div className="p-3 text-[10px] leading-relaxed">
        {info?.address ? (
          <>
            <a
              href={`${ROBINHOOD_CHAIN.explorer}/address/${info.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-lime underline decoration-lime/40 underline-offset-2 hover:decoration-lime"
            >
              {shortAddr(info.address)}
            </a>
            <div className="mt-1 flex justify-between text-ink-dim">
              <span>BALANCE</span>
              <span className="text-ink">
                {info.balanceEth === null
                  ? "…"
                  : `${info.balanceEth.toFixed(4)} ETH`}
              </span>
            </div>
            <div className="mt-2 text-[9px] text-ink-faint">
              Every order this wallet signs is public. Verify on Blockscout —
              do not take the raster&apos;s word for it.
            </div>
          </>
        ) : (
          <>
            <span className="text-amber">AWAITING FUNDING</span>
            <div className="mt-1 text-ink-dim">
              The fly&apos;s EVM wallet drops here when live execution starts.
              Robinhood Chain · gas in ETH · keys never leave the box.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
