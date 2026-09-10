export interface GuardLimits { orderEth: number; maxInventoryEth: number; drawdownStopEth: number; minIntervalMs: number }
export interface GuardInput {
  side: "BUY" | "SELL";
  now: number;
  lastOrderAt: number;
  cashEth: number;
  positionsEth: number;
  tradingPnl: number;
  sellableEth: number;
  valuationComplete: boolean;
  pending: boolean;
}

export function guardReason(input: GuardInput, limits: GuardLimits): string | null {
  if (input.pending) return "unresolved execution — reconcile before another order";
  if (![input.now, input.lastOrderAt, input.cashEth, input.positionsEth, input.tradingPnl, input.sellableEth].every(Number.isFinite)) return "invalid accounting or price";
  if ([input.cashEth, input.positionsEth, input.sellableEth].some(v => v < 0)) return "invalid negative accounting";
  if (input.lastOrderAt > input.now) return "clock moved backward — order cooldown unverified";
  if (input.lastOrderAt && input.now - input.lastOrderAt < limits.minIntervalMs) return "cooldown — minimum interval between orders";
  if (input.side === "BUY") {
    if (!input.valuationComplete) return "incomplete or stale inventory valuation";
    if (input.tradingPnl <= -limits.drawdownStopEth) return "drawdown stop — trading P&L, deposits excluded";
    if (input.positionsEth + limits.orderEth > limits.maxInventoryEth + 1e-12) return "inventory cap — open positions at maximum";
    if (input.cashEth < limits.orderEth * 1.2) return "budget — cash below order reserve";
  } else if (input.sellableEth < limits.orderEth * .1) return "inventory — nothing to sell";
  return null;
}

export function assertChain(actual: number, expected: number): void {
  if (actual !== expected) throw new Error(`Chain mismatch: expected ${expected}, received ${actual}`);
}
