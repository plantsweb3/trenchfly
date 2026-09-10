import { NextResponse } from "next/server";
import { FLY_WALLET, ROBINHOOD_CHAIN } from "@/lib/chain";
import { resolveRpcUrl } from "@/lib/rpc-config";

export async function GET() {
  if (!FLY_WALLET) return NextResponse.json({ address: null, balanceEth: null });
  try {
    let raw: unknown;
    const endpoint = process.env.ROBINFLY_RPC_URL;
    if (endpoint) {
      const response = await fetch(resolveRpcUrl(endpoint), {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [FLY_WALLET, "latest"] }),
        next: { revalidate: 15 }, signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) throw new Error("Wallet provider unavailable");
      raw = (await response.json()).result;
      if (typeof raw !== "string" || !/^0x[0-9a-f]+$/i.test(raw)) throw new Error("Invalid balance");
    } else {
      // The public wallet panel can use the explorer without a private worker credential.
      const response = await fetch(`${ROBINHOOD_CHAIN.explorer}/api/v2/addresses/${FLY_WALLET}`, {
        headers: { Accept: "application/json" }, next: { revalidate: 30 }, signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) throw new Error("Explorer balance unavailable");
      raw = (await response.json()).coin_balance;
      if (typeof raw !== "string" || !/^\d+$/.test(raw)) throw new Error("Invalid explorer balance");
    }
    const wei = BigInt(raw as string);
    const balanceEth = Number(wei / BigInt(1e12)) / 1e6;
    return NextResponse.json({ address: FLY_WALLET, balanceEth, source: endpoint ? "rpc" : "explorer" });
  } catch {
    return NextResponse.json({ address: FLY_WALLET, balanceEth: null });
  }
}
