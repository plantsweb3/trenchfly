import Hero from "@/components/Hero";
import Terminal from "@/components/Terminal";
import Reveal from "@/components/Reveal";
import { FLY_WALLET, ROBINHOOD_CHAIN } from "@/lib/chain";

const TAPE = [
  "CASHCAT/ETH $0.2540",
  "GOOSE/ETH $0.0780",
  "CHUMP/ETH $0.0301",
  "AI/NVDA $0.3210",
  "O1BOT/ETH $0.002150",
  "CHAIN 4663 · GAS ETH",
  "DNp20 Δ +2.1 Hz",
  "KC→MBON PLASTICITY: IN BUILD",
  "GUARD ARMED",
];

const VENUES = [
  {
    name: "PONS",
    tag: "the factory",
    body: "Robinhood Chain's bonding-curve launchpad — ~25,000 token launches a day at peak, $544M daily volume, 80% of protocol revenue burned into PONS. The fly knows none of this. It sees a line.",
  },
  {
    name: "LONG.XYZ",
    tag: "stock-paired",
    body: "Memecoins that trade against NVDA, TSLA and other Robinhood Stock Tokens instead of ETH. The fly's AI/NVDA chart is two derivatives deep. It is not troubled by this.",
  },
  {
    name: "O1",
    tag: "tweet-to-launch",
    body: "A post on X becomes a token with permanently locked Uniswap v4 liquidity. The fly cannot post. It can only buy.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "IT SEES A CHART",
    body: "A Robinhood Chain launchpad chart is rendered to 320×180 RGB pixels and driven into 3,335 R1–R6 photoreceptors and 811 R8 color cells. The fly is not told what a memecoin is. So far this has not been a disadvantage.",
  },
  {
    n: "02",
    title: "THE BRAIN RUNS",
    body: "The full retained MaleCNS v1.0 connectome: 166,700 neurons, 25.1 million compiled synapses, SHA-256 pinned, integrated at 0.1 ms. None of it evolved for this. All of it is being used for this.",
  },
  {
    n: "03",
    title: "SPIKES BECOME ORDERS",
    body: "Mean right DNp20 firing minus left DNp20 firing ≥ +2 Hz, with a DNpe017 spike, proposes a market buy. ≤ −2 Hz proposes a sell. In a living fly this circuit steers flight. Here it signs a $10 CASHCAT swap.",
  },
  {
    n: "04",
    title: "PROFIT IS DOPAMINE",
    body: "Equity up ≥ $0.01 pulses 15 PAM11 dopamine cells. Down ≥ $0.01 pulses 2 PPL101 aversive cells. KC→MBON plasticity is next on the public checklist — until it ships, the fly does not learn. It just vibes on anatomy.",
  },
];

const RULES = [
  ["CAPITAL", "$100. Total. This is the whole fund."],
  ["ORDER LIMIT", "$10 per order, fees included. Conviction is capped by design."],
  ["FREQUENCY", "No daily cap. The fly trades whenever the spikes say trade — order size is the leash, not the clock."],
  [
    "DRAWDOWN",
    "A $20 drawdown stops new orders. It does not liquidate holdings — the fly rides the bag down like everyone else.",
  ],
  [
    "INVENTORY",
    "Creator rewards pile up in the wallet, but the fly can never hold more than ~5 order-sizes of tokens at once. The pile is not the fly's to spend.",
  ],
  ["LEVERAGE", "None. No shorts, no margin, no transfer scope on the key."],
];

export default function Home() {
  return (
    <main className="relative">
      <Hero />

      {/* tape */}
      <div className="overflow-hidden border-y border-line bg-inset py-2 text-[10px] tracking-[0.2em] text-ink-dim">
        <div className="ticker-track">
          {[0, 1].map((k) => (
            <div key={k} className="flex shrink-0 gap-12" aria-hidden={k === 1}>
              {TAPE.map((t) => (
                <span key={t}>
                  <span className="mr-2 text-lime">◆</span>
                  {t}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <Terminal />

      {/* verify */}
      <section id="verify" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <Reveal>
            <h2
              className="text-2xl text-ink sm:text-3xl"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              DON&apos;T TRUST THE <span className="text-lime">FLY</span>
            </h2>
            <p
              className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-dim"
              style={{ fontFamily: "var(--font-plex-sans)" }}
            >
              Verify it. Every claim on this page maps to something you can
              check yourself. Status is updated as each layer ships — nothing
              here is marked done before it is.
            </p>
          </Reveal>
          <div className="mt-8 divide-y divide-line border border-line">
            {[
              {
                k: "FLY WALLET",
                status: "LIVE",
                color: "var(--green)",
                body: "One public EVM wallet on chain 4663. Every order it ever signs is permanently visible.",
                href: FLY_WALLET
                  ? `${ROBINHOOD_CHAIN.explorer}/address/${FLY_WALLET}`
                  : ROBINHOOD_CHAIN.explorer,
                link: FLY_WALLET
                  ? `${FLY_WALLET.slice(0, 6)}…${FLY_WALLET.slice(-4)} on Blockscout ↗`
                  : "Blockscout ↗",
              },
              {
                k: "OPEN SOURCE",
                status: "LIVE",
                color: "var(--green)",
                body: "The site, the execution worker, the guard, the decision layer — all public. Read what actually runs.",
                href: "https://github.com/plantsweb3/trenchfly",
                link: "github.com/plantsweb3/trenchfly ↗",
              },
              {
                k: "ONCHAIN EXECUTION",
                status: "PAPER",
                color: "var(--amber)",
                body: "The worker quotes real Uniswap v3 pools and runs the full decision loop in paper mode. It flips live after the paper session passes; from then on the trade log above is transactions, not simulation.",
                href: "https://github.com/plantsweb3/trenchfly/tree/main/worker",
                link: "worker source ↗",
              },
              {
                k: "CONNECTOME KERNEL",
                status: "LIVE",
                color: "var(--green)",
                body: "The full 166,700-neuron, 25.1M-synapse spiking simulation (MaleCNS v1.0, SHA-256 pinned) now proposes every worker decision — chart pixels → photoreceptors → DNp20 spikes, with each observation's exact frame hashed and logged. Known limits (no retinotopy yet, deviation decode) are documented in the repo, not hidden.",
                href: "https://github.com/plantsweb3/trenchfly/tree/main/brain",
                link: "brain source + checklist ↗",
              },
            ].map((r) => (
              <div
                key={r.k}
                className="grid gap-2 px-4 py-4 sm:grid-cols-[170px_70px_1fr_auto] sm:items-baseline sm:gap-6"
              >
                <span className="text-[10px] font-bold tracking-[0.25em] text-ink">
                  {r.k}
                </span>
                <span
                  className="text-[10px] font-bold tracking-[0.2em]"
                  style={{ color: r.color }}
                >
                  {r.status}
                </span>
                <span
                  className="text-sm text-ink-dim"
                  style={{ fontFamily: "var(--font-plex-sans)" }}
                >
                  {r.body}
                </span>
                <a
                  href={r.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-lime underline decoration-lime/40 underline-offset-2 hover:decoration-lime"
                >
                  {r.link}
                </a>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">
            The terminal above is a labeled paper simulation until execution
            goes live. When it flips, this page will say so. Fabricated
            receipts are for other coins.
          </p>
        </div>
      </section>


      {/* how it works */}
      <section className="relative border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h2
            className="text-2xl text-ink sm:text-3xl"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            HOW A FLY <span className="text-lime">APES IN</span>
          </h2>
          <p
            className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-dim"
            style={{ fontFamily: "var(--font-plex-sans)" }}
          >
            No LLM selects trades. No price rule overrides the neural proposal.
            The pipeline is chart → retina → connectome → motor neurons →
            Robinhood order ticket, and every stage is auditable.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 90}>
                <div className="panel corner card-hover h-full p-4">
                  <div
                    className="text-3xl text-lime-dim"
                    style={{ fontFamily: "var(--font-pixel)" }}
                  >
                    {s.n}
                  </div>
                  <div className="mt-2 text-[11px] font-bold tracking-[0.2em] text-ink">
                    {s.title}
                  </div>
                  <p
                    className="mt-3 text-xs leading-relaxed text-ink-dim"
                    style={{ fontFamily: "var(--font-plex-sans)" }}
                  >
                    {s.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* the venues */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h2
            className="text-2xl text-ink sm:text-3xl"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            THE <span className="text-green">TRENCHES</span>
          </h2>
          <p
            className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-dim"
            style={{ fontFamily: "var(--font-plex-sans)" }}
          >
            The fly hunts on Robinhood Chain — chain ID 4663, gas in ETH,
            mainnet since July 2026 — across its three launchpads. Round-robin,
            fixed schedule. The network does not choose which trench it is
            shown.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {VENUES.map((v, i) => (
              <Reveal key={v.name} delay={i * 90}>
                <div className="panel corner card-hover h-full p-4">
                  <div className="flex items-baseline justify-between">
                    <span
                      className="text-lg text-green"
                      style={{ fontFamily: "var(--font-pixel)" }}
                    >
                      {v.name}
                    </span>
                    <span className="text-[9px] tracking-[0.2em] text-ink-faint">
                      {v.tag.toUpperCase()}
                    </span>
                  </div>
                  <p
                    className="mt-3 text-xs leading-relaxed text-ink-dim"
                    style={{ fontFamily: "var(--font-plex-sans)" }}
                  >
                    {v.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* the guard */}
      <section className="border-t border-line bg-inset/60">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h2
            className="text-2xl text-ink sm:text-3xl"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            THE <span className="text-amber">GUARD</span>
          </h2>
          <p
            className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-dim"
            style={{ fontFamily: "var(--font-plex-sans)" }}
          >
            A deterministic risk layer sits between the brain and the broker.
            It can reject an order for price, budget, inventory or timing
            reasons. It cannot replace the proposal, and it cannot manufacture
            a profitable policy. Nobody can give the fly that.
          </p>
          <div className="mt-8 divide-y divide-line border border-line">
            {RULES.map(([k, v]) => (
              <div
                key={k}
                className="grid gap-1 px-4 py-3 sm:grid-cols-[160px_1fr] sm:gap-6"
              >
                <span className="text-[10px] font-bold tracking-[0.25em] text-amber">
                  {k}
                </span>
                <span
                  className="text-sm text-ink-dim"
                  style={{ fontFamily: "var(--font-plex-sans)" }}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-14 text-center">
          <div
            className="text-xl text-ink"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            TRENCH<span className="text-lime">FLY</span>
          </div>
          <p
            className="mx-auto mt-4 max-w-xl text-xs leading-relaxed text-ink-dim"
            style={{ fontFamily: "var(--font-plex-sans)" }}
          >
            A fly-connectome trading experiment pointed at the trenches.
            Connectome: MaleCNS v1.0, Janelia Research Campus — 166,700
            neurons, 25.6M connections, released for science, repurposed for
            this.
          </p>
          <div className="mx-auto mt-8 max-w-md border border-line px-4 py-3">
            <div className="text-[10px] tracking-[0.25em] text-ink-dim">
              $TRENCHFLY · CA
            </div>
            <div className="mt-1 text-sm text-amber">
              TBA — drops with the fly&apos;s wallet
            </div>
            <div className="mt-1 text-[9px] leading-relaxed text-ink-faint">
              Anything claiming to be $TRENCHFLY before the CA appears on this
              page is not the fly.
            </div>
          </div>
          <p className="mx-auto mt-6 max-w-xl text-[10px] leading-relaxed text-ink-faint">
            Not affiliated with Robinhood, Robinhood Chain, Pons, long.xyz or
            o1. Not financial advice — the analyst is a simulated fly. Paper
            session shown until the wallet goes live; profitable learning has
            not been demonstrated. No flies were harmed. One was simulated
            extensively.
          </p>
        </div>
      </footer>
    </main>
  );
}
