// Trenchfly client-side paper simulation.
// Numbers are grounded in the MaleCNS v1.0 connectome release: 166,700
// neurons, 25.6M connections, DNp20 L/R decoder, 15 PAM11 / 2 PPL101
// dopamine cells. Markets are Robinhood Chain launchpad tokens (Pons,
// long.xyz, o1). Everything here is a browser toy — the real EVM execution
// path lives in /worker.

export type Ticker = "CASHCAT" | "GOOSE" | "CHUMP" | "AI" | "O1BOT";
export type Venue = "Pons" | "long.xyz" | "o1";

export const TICKERS: Ticker[] = ["CASHCAT", "GOOSE", "CHUMP", "AI", "O1BOT"];

export const COIN_META: Record<
  Ticker,
  {
    name: string;
    venue: Venue;
    pair: string;
    start: number;
    vol: number;
    decimals: number;
  }
> = {
  CASHCAT: { name: "Cash Cat", venue: "Pons", pair: "ETH", start: 0.254, vol: 0.006, decimals: 4 },
  GOOSE: { name: "Goose Token", venue: "Pons", pair: "ETH", start: 0.078, vol: 0.007, decimals: 4 },
  CHUMP: { name: "Chump Coin", venue: "Pons", pair: "ETH", start: 0.0301, vol: 0.008, decimals: 4 },
  AI: { name: "Artificial Inu", venue: "long.xyz", pair: "NVDA", start: 0.321, vol: 0.01, decimals: 4 },
  O1BOT: { name: "o1Bot", venue: "o1", pair: "ETH", start: 0.00215, vol: 0.008, decimals: 6 },
};

export type Proposal = "BUY" | "SELL" | "HOLD";

export interface Trade {
  id: number;
  obs: number;
  side: "BUY" | "SELL";
  ticker: Ticker;
  usd: number;
  qty: number;
  price: number;
  rejected: string | null;
}

export interface CoinState {
  price: number;
  history: number[];
  momentum: number;
}

export interface SimState {
  obs: number;
  coins: Record<Ticker, CoinState>;
  active: Ticker;
  cash: number;
  holdings: Record<Ticker, number>;
  equity: number;
  equityHistory: number[];
  rateL: number;
  rateR: number;
  dnpe017: boolean;
  proposal: Proposal;
  lastGuard: string | null;
  trades: Trade[];
  spikesTotal: number;
  pamPulse: number; // observations remaining on PAM11 profit pulse
  pplPulse: number; // observations remaining on PPL101 loss pulse
  dailyOrders: number;
  lastPnl: number;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng: () => number) {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const CAPITAL = 100;
const ORDER_LIMIT = 10;
const FEE = 0.006;
const HISTORY = 100;

function emptyHoldings(): Record<Ticker, number> {
  return { CASHCAT: 0, GOOSE: 0, CHUMP: 0, AI: 0, O1BOT: 0 };
}

export function createSim(seed: number): SimState {
  const rng = mulberry32(seed);
  const coins = {} as Record<Ticker, CoinState>;
  for (const t of TICKERS) {
    const meta = COIN_META[t];
    let p = meta.start;
    const history: number[] = [];
    for (let i = 0; i < HISTORY; i++) {
      p *= 1 + gauss(rng) * meta.vol;
      history.push(p);
    }
    coins[t] = { price: p, history, momentum: 0 };
  }
  return {
    obs: 0,
    coins,
    active: "CASHCAT",
    cash: CAPITAL,
    holdings: emptyHoldings(),
    equity: CAPITAL,
    equityHistory: [CAPITAL],
    rateL: 6.5,
    rateR: 6.5,
    dnpe017: false,
    proposal: "HOLD",
    lastGuard: null,
    trades: [],
    spikesTotal: 0,
    pamPulse: 0,
    pplPulse: 0,
    dailyOrders: 0,
    lastPnl: 0,
  };
}

let tradeId = 0;

export function tick(s: SimState, rng: () => number): SimState {
  const obs = s.obs + 1;

  // Advance every market; regime-y drift so trench conditions actually trend.
  const coins = {} as Record<Ticker, CoinState>;
  for (const t of TICKERS) {
    const c = s.coins[t];
    const meta = COIN_META[t];
    const momentum =
      c.momentum * 0.92 + gauss(rng) * meta.vol * 0.6;
    const price = Math.max(
      c.price * (1 + momentum + gauss(rng) * meta.vol),
      meta.start * 0.2,
    );
    const history = [...c.history.slice(-(HISTORY - 1)), price];
    coins[t] = { price, history, momentum };
  }

  // Fixed round-robin presentation; the network does not choose the asset.
  const active = TICKERS[obs % TICKERS.length];

  // DNp20 firing rates as mean-reverting processes. The right rate leans on
  // recent chart slope because that is literally what hits the photoreceptors.
  const slope =
    (coins[active].price - coins[active].history[HISTORY - 8]) /
    coins[active].history[HISTORY - 8];
  const rateL = clamp(
    s.rateL + 0.35 * (6.5 - s.rateL) + gauss(rng) * 1.6,
    0,
    22,
  );
  const rateR = clamp(
    s.rateR + 0.35 * (6.5 + clamp(slope * 400, -5, 5) - s.rateR) +
      gauss(rng) * 1.6,
    0,
    22,
  );
  const dnpe017 = rng() < 0.62;

  const diff = rateR - rateL;
  let proposal: Proposal = "HOLD";
  if (diff >= 2 && dnpe017) proposal = "BUY";
  else if (diff <= -2 && dnpe017) proposal = "SELL";

  // Guard: price, budget, inventory, timing. It can reject a proposal;
  // it cannot replace it.
  let cash = s.cash;
  const holdings = { ...s.holdings };
  let lastGuard: string | null = null;
  let dailyOrders = s.dailyOrders;
  const trades = s.trades.slice(-19);
  const px = coins[active].price;

  if (proposal !== "HOLD") {
    // guard parity with the worker: same rules the site advertises
    let positionsValue = 0;
    for (const t of TICKERS) positionsValue += holdings[t] * coins[t].price;
    const equityNow = cash + positionsValue;

    let rejected: string | null = null;
    if (equityNow <= CAPITAL - 20)
      rejected = "drawdown stop — no new orders";
    else if (rng() < 0.07)
      rejected = "price — slippage 0.63% over 0.50% limit";
    else if (
      proposal === "BUY" &&
      positionsValue + ORDER_LIMIT > 5 * ORDER_LIMIT
    )
      rejected = "inventory cap — open positions at maximum";
    else if (proposal === "BUY" && cash < 1.05)
      rejected = "budget — cash below minimum order";
    else if (proposal === "SELL" && holdings[active] * px < 0.25)
      rejected = "inventory — zero sellable position";

    if (rejected) {
      lastGuard = rejected;
      trades.push({
        id: ++tradeId, obs, side: proposal, ticker: active,
        usd: 0, qty: 0, price: px, rejected,
      });
    } else if (proposal === "BUY") {
      const usd = Math.min(ORDER_LIMIT, cash);
      const qty = (usd * (1 - FEE)) / px;
      cash -= usd;
      holdings[active] += qty;
      dailyOrders += 1;
      trades.push({
        id: ++tradeId, obs, side: "BUY", ticker: active,
        usd, qty, price: px, rejected: null,
      });
    } else {
      const usd = Math.min(ORDER_LIMIT, holdings[active] * px);
      const qty = usd / px;
      holdings[active] -= qty;
      cash += usd * (1 - FEE);
      dailyOrders += 1;
      trades.push({
        id: ++tradeId, obs, side: "SELL", ticker: active,
        usd, qty, price: px, rejected: null,
      });
    }
  }

  let equity = cash;
  for (const t of TICKERS) equity += holdings[t] * coins[t].price;
  const lastPnl = equity - s.equity;

  // ±$0.01 deadband gates the binary dopamine pulse, same as the reference.
  const pamPulse = lastPnl >= 0.01 ? 2 : Math.max(0, s.pamPulse - 1);
  const pplPulse = lastPnl <= -0.01 ? 2 : Math.max(0, s.pplPulse - 1);

  return {
    obs,
    coins,
    active,
    cash,
    holdings,
    equity,
    equityHistory: [...s.equityHistory.slice(-119), equity],
    rateL,
    rateR,
    dnpe017,
    proposal,
    lastGuard,
    trades,
    spikesTotal:
      s.spikesTotal + Math.floor(110_000 + rng() * 55_000),
    pamPulse,
    pplPulse,
    dailyOrders,
    lastPnl,
  };
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

export function fmtPrice(t: Ticker, p: number) {
  return "$" + p.toFixed(COIN_META[t].decimals);
}

export function fmtUsd(n: number) {
  return "$" + n.toFixed(2);
}
