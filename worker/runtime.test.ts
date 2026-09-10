import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { encodeAbiParameters, encodeEventTopics, parseAbi, type Address, type TransactionReceipt } from "viem";
import { acquireWorkerLock, initialLedger, loadLedger, saveLedger, validateLedger } from "./state";
import { assertChain, guardReason } from "./guard";
import { referencedFrames } from "./feed";
import { receivedTokens, receiptFee } from "./settlement";
import { Tier2Client } from "./brain";

const owner = ("0x" + "1".repeat(40)) as Address;
const token = ("0x" + "2".repeat(40)) as Address;
const other = ("0x" + "3".repeat(40)) as Address;
const limits = { orderEth: .0025, maxInventoryEth: .0125, drawdownStopEth: .005, minIntervalMs: 60_000 };
const input = { side: "BUY" as const, now: 1_000_000, lastOrderAt: 0, cashEth: .025, positionsEth: 0, tradingPnl: 0, sellableEth: .005, valuationComplete: true, pending: false };
function directory(t: test.TestContext) { const dir = mkdtempSync(join(tmpdir(), "robinfly-test-")); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; }

test("paper and live ledgers cannot share balances or loss totals", t => {
  const dir = directory(t); const paper = initialLedger("paper", .025, null); paper.buyTotalEth = .02; paper.paperEth = .005; saveLedger(dir, paper);
  const live = loadLedger(dir, "live", .025, owner); assert.equal(live.buyTotalEth, 0); assert.equal(live.paperEth, .025); assert.equal(loadLedger(dir, "paper", .025, null).buyTotalEth, .02);
});
test("paper cash, holdings and cooldown survive restart", t => {
  const dir = directory(t), ledger = initialLedger("paper", .025, null);
  ledger.holdings[token] = 12.5; ledger.tokens[token] = { symbol: "TEST", decimals: 18, fee: 3000 }; ledger.lastOrderAt = 999_000; ledger.ordersTotal = 3; ledger.paperEth = .0225;
  saveLedger(dir, ledger); assert.deepEqual(loadLedger(dir, "paper", .025, null), ledger);
});
test("corrupt state is not reset to fresh capital", t => { const dir = directory(t); writeFileSync(join(dir, "paper-state.json"), "broken"); assert.throws(() => loadLedger(dir, "paper", .025, null)); });
test("unknown legacy totals block live state creation", t => { const dir = directory(t); writeFileSync(join(dir, "state.json"), "{}"); assert.throws(() => loadLedger(dir, "live", .025, owner), /Legacy/); });
test("ledger cannot migrate to a different wallet silently", () => assert.throws(() => validateLedger(initialLedger("live", .025, owner), "live", other), /mismatch/));
test("invalid holdings and non-finite accounting are rejected", () => { const ledger = initialLedger("paper", .025, null); ledger.paperEth = NaN; assert.throws(() => validateLedger(ledger, "paper", null)); ledger.paperEth = .025; ledger.holdings[token] = -1; assert.throws(() => validateLedger(ledger, "paper", null)); });
test("pending intent survives restart for reconciliation", t => { const dir = directory(t), ledger = initialLedger("live", .025, owner); ledger.pending = { id: "intent", token, side: "BUY", createdAt: new Date().toISOString() }; saveLedger(dir, ledger); assert.deepEqual(loadLedger(dir, "live", .025, owner).pending, ledger.pending); });
test("second worker cannot acquire an active lock", t => { const dir = directory(t), release = acquireWorkerLock(dir); assert.throws(() => acquireWorkerLock(dir), /running/); release(); const releaseAgain = acquireWorkerLock(dir); releaseAgain(); });
test("unknown lock owners fail closed", t => { const dir = directory(t); writeFileSync(join(dir, "worker.lock"), JSON.stringify({ pid: -1 })); assert.throws(() => acquireWorkerLock(dir), /invalid/); });
test("state persistence writes valid standalone JSON", t => { const dir = directory(t), ledger = initialLedger("paper", .025, null); saveLedger(dir, ledger); assert.equal(JSON.parse(readFileSync(join(dir, "paper-state.json"), "utf8")).mode, "paper"); });

test("healthy first order passes guard", () => assert.equal(guardReason(input, limits), null));
test("cooldown is global and covers buys and sells", () => { for (const side of ["BUY", "SELL"] as const) assert.match(guardReason({ ...input, side, lastOrderAt: input.now - 59_999 }, limits)!, /cooldown/); });
test("cooldown opens at exact boundary", () => assert.equal(guardReason({ ...input, lastOrderAt: input.now - 60_000 }, limits), null));
test("clock reversal blocks an order", () => assert.match(guardReason({ ...input, lastOrderAt: input.now + 1 }, limits)!, /clock/));
test("pending execution blocks every new order", () => assert.match(guardReason({ ...input, pending: true }, limits)!, /unresolved/));
test("unknown inventory value blocks buys", () => assert.match(guardReason({ ...input, valuationComplete: false }, limits)!, /valuation/));
test("drawdown stop does not prevent an otherwise valid exit", () => { assert.match(guardReason({ ...input, tradingPnl: -.005 }, limits)!, /drawdown/); assert.equal(guardReason({ ...input, side: "SELL", tradingPnl: -.005 }, limits), null); });
test("deposits cannot bypass position cap", () => assert.match(guardReason({ ...input, cashEth: 100, positionsEth: .011 }, limits)!, /inventory cap/));
test("non-finite data cannot pass guard comparisons", () => assert.match(guardReason({ ...input, positionsEth: NaN }, limits)!, /invalid/));
test("wrong chain is a hard failure", () => { assert.throws(() => assertChain(1, 4663), /mismatch/); assert.doesNotThrow(() => assertChain(4663, 4663)); });
test("insufficient sell inventory is rejected", () => assert.match(guardReason({ ...input, side: "SELL", sellableEth: 0 }, limits)!, /nothing to sell/));

const transfer = parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
function log(address: Address, from: Address, to: Address, value: bigint) {
  return { address, topics: encodeEventTopics({ abi: transfer, eventName: "Transfer", args: { from, to } }), data: encodeAbiParameters([{ type: "uint256" }], [value]) } as unknown as TransactionReceipt["logs"][number];
}
test("settlement counts only this token's net receipt transfers", () => {
  const logs = [log(token, other, owner, 100n), log(token, owner, other, 20n), log(other, other, owner, 900n)];
  assert.equal(receivedTokens({ logs }, token, owner), 80n);
});
test("unrelated and malformed events cannot invent proceeds", () => assert.equal(receivedTokens({ logs: [{ address: token, topics: [], data: "0x" } as unknown as TransactionReceipt["logs"][number]] }, token, owner), 0n));
test("fees are derived from receipt quantities", () => assert.equal(receiptFee({ gasUsed: 21_000n, effectiveGasPrice: 2_000_000_000n }), 42_000_000_000_000n));
test("all referenced frames survive, not just the newest twelve", () => {
  const recent = Array.from({ length: 40 }, (_, i) => ({ frameSha: i.toString(16).padStart(64, "0") }));
  assert.equal(referencedFrames({ recent: recent as never }).size, 40);
});
test("invalid frame hashes cannot escape the frames directory", () => assert.equal(referencedFrames({ recent: [{ frameSha: "../private" }] as never }).size, 0));

test("brain spawn failures reject readiness without crashing the host", async () => {
  const client = new Tier2Client("/missing/robinfly-python", "/missing/script");
  await assert.rejects(client.ready, /brain process/); client.close();
});
test("brain requests pair by id, strip signer key, and close the child", async t => {
  const dir = directory(t), script = join(dir, "brain.cjs");
  writeFileSync(script, `const rl=require('node:readline').createInterface({input:process.stdin}); console.log(JSON.stringify({ready:true,neurons:10,synapses:20})); rl.on('line',line=>{const j=JSON.parse(line); console.log(JSON.stringify({id:j.id,value:j.value,keyPresent:!!process.env.FLY_PRIVATE_KEY}));});`);
  const client = new Tier2Client(process.execPath, script); t.after(() => client.close());
  assert.equal((await client.ready).neurons, 10);
  const results = await Promise.all([client.request({ value: "a" }), client.request({ value: "b" })]);
  assert.deepEqual(results.map(r => r.value), ["a", "b"]); assert.equal(results[0].keyPresent, false);
  const exited = once(client.proc, "exit"); client.close(); await exited;
  await assert.rejects(client.request({}), /closed|exited/);
});
test("brain timeout stops the stalled process", async t => {
  const dir = directory(t), script = join(dir, "stall.cjs");
  writeFileSync(script, `console.log(JSON.stringify({ready:true,neurons:10,synapses:20})); setInterval(()=>{},1000);`);
  const client = new Tier2Client(process.execPath, script); t.after(() => client.close()); await client.ready;
  const exited = once(client.proc, "exit"); await assert.rejects(client.request({}, 30), /timeout/); await exited;
});


// Configuration and provider failures are tested offline; no denied endpoints are retried.
import { resolveRpcUrl, rpcFailureStatus, isUnavailableRoute, safeError } from "../lib/rpc-config";
test("RPC configuration requires a private HTTPS endpoint", () => {
  for (const value of [undefined, "", "bad", "http://provider.example/key", "https://user:secret@provider.example", "https://rpc.mainnet.chain.robinhood.com"]) assert.throws(() => resolveRpcUrl(value));
  assert.equal(resolveRpcUrl("https://provider.example/v2/test-key"), "https://provider.example/v2/test-key");
});
test("nested access and quota errors preserve their stop condition", () => {
  for (const status of [401, 403, 429] as const) assert.equal(rpcFailureStatus({ cause: { cause: { status } } }), status);
  assert.equal(rpcFailureStatus({ cause: { code: 429 } }), 429);
  assert.equal(rpcFailureStatus(new Error("ordinary failure")), null);
});
test("reverts alone can mean no route, but denied access cannot", () => {
  assert.equal(isUnavailableRoute({ cause: { name: "ContractFunctionRevertedError" } }), true);
  assert.equal(isUnavailableRoute({ name: "ContractFunctionRevertedError", cause: { status: 403 } }), false);
  assert.equal(isUnavailableRoute({ name: "HttpRequestError", status: 500 }), false);
});
test("provider secrets and challenge bodies never enter public error messages", () => {
  const secret = "private-provider-key";
  const error = { name: "ContractFunctionExecutionError", shortMessage: "Failed https://provider.example/" + secret, cause: { status: 403, body: secret } };
  assert.equal(safeError(error).includes(secret), false);
  assert.equal(safeError(new Error("request https://provider.example/" + secret)).includes(secret), false);
  assert.match(safeError({ status: 429 }), /paused/);
});
test("cyclic provider causes terminate safely", () => {
  const error: { cause?: unknown } = {}; error.cause = error;
  assert.equal(rpcFailureStatus(error), null);
});
