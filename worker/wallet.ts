// Generates a fresh EVM keypair for the fly and writes worker/.env.
// The key is created locally, never printed, never committed (.env is
// gitignored). Fund the address yourself — and never with more than
// GUARD.capitalEth. Refuses to overwrite an existing .env.

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { existsSync, writeFileSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const envPath = join(dir, ".env");

if (existsSync(envPath)) {
  console.error("worker/.env already exists — refusing to overwrite.");
  console.error("Move it aside manually if you really want a new wallet.");
  process.exit(1);
}

const pk = generatePrivateKey();
const account = privateKeyToAccount(pk);

writeFileSync(envPath, `FLY_PRIVATE_KEY=${pk}\n`, { mode: 0o600 });
chmodSync(envPath, 0o600);

console.log("New fly wallet generated.");
console.log(`  address: ${account.address}`);
console.log(`  key:     worker/.env (chmod 600, gitignored)`);
console.log("");
console.log("Next steps (yours, not the bot's):");
console.log("  1. Fund it on Robinhood Chain (chain 4663) — small. ≤0.025 ETH.");
console.log("  2. Set NEXT_PUBLIC_FLY_WALLET on Vercel to the address above");
console.log("     so trenchfly.xyz shows the live wallet panel.");
console.log("  3. npm run preflight, then npm run paper before ever --live.");
