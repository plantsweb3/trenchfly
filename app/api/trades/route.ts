import { NextResponse } from "next/server";
import { FLY_WALLET, ROBINHOOD_CHAIN } from "@/lib/chain";

export const dynamic = "force-dynamic";

interface OnchainTx {
  hash: string;
  method: string | null;
  timestamp: string | null;
  success: boolean;
  direction: "out" | "in";
  valueEth: number;
}

export async function GET() {
  if (!FLY_WALLET) return NextResponse.json({ txs: [] });
  try {
    const res = await fetch(
      `${ROBINHOOD_CHAIN.explorer}/api/v2/addresses/${FLY_WALLET}/transactions`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
        },
        next: { revalidate: 30 },
      },
    );
    if (!res.ok) return NextResponse.json({ txs: [] });
    const json = await res.json();
    const me = FLY_WALLET.toLowerCase();
    const txs: OnchainTx[] = (json.items ?? []).slice(0, 25).map(
      (t: {
        hash: string;
        method: string | null;
        timestamp: string | null;
        result: string;
        from?: { hash?: string };
        value?: string;
      }) => ({
        hash: t.hash,
        method: t.method,
        timestamp: t.timestamp,
        success: t.result === "success",
        direction: t.from?.hash?.toLowerCase() === me ? "out" : "in",
        valueEth: Number(t.value ?? 0) / 1e18,
      }),
    );
    return NextResponse.json({ txs });
  } catch {
    return NextResponse.json({ txs: [] });
  }
}
