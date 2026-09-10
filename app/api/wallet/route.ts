import { NextResponse } from "next/server";
import { FLY_WALLET, ROBINHOOD_CHAIN } from "@/lib/chain";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!FLY_WALLET) {
    return NextResponse.json({ address: null, balanceEth: null });
  }
  try {
    const res = await fetch(ROBINHOOD_CHAIN.rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [FLY_WALLET, "latest"],
      }),
      next: { revalidate: 0 },
    });
    const json = await res.json();
    const wei = BigInt(json.result ?? "0x0");
    const balanceEth = Number(wei / BigInt(1e12)) / 1e6;
    return NextResponse.json({ address: FLY_WALLET, balanceEth });
  } catch {
    return NextResponse.json({ address: FLY_WALLET, balanceEth: null });
  }
}
