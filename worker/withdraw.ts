// Exit hatch: sweep the fly wallet's ETH to an address you control.
// Run it YOURSELF: npm run withdraw -- 0xYourDestination
// Sends the full balance minus gas. Tokens are not swept — sell them
// first (the worker's SELL path) or import worker/.env into a wallet app.

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { formatEther, isAddress, type Address } from "viem";
import { robinhoodChain } from "./config";
import { publicClient } from "./market";
import { walletFromEnv } from "./execute";

const dir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(dir, ".env") });

async function main() {
  const dest = process.argv[2];
  if (!dest || !isAddress(dest)) {
    console.error("Usage: npm run withdraw -- 0xDestinationAddress");
    process.exit(1);
  }
  const wallet = walletFromEnv();
  if (!wallet) {
    console.error("No FLY_PRIVATE_KEY in worker/.env");
    process.exit(1);
  }
  const balance = await publicClient.getBalance({
    address: wallet.account.address,
  });
  const gasPrice = await publicClient.getGasPrice();
  const gasCost = gasPrice * 30_000n; // margin over the 21k transfer
  if (balance <= gasCost) {
    console.error(
      `Balance ${formatEther(balance)} ETH does not cover gas — nothing to sweep.`,
    );
    process.exit(1);
  }
  const value = balance - gasCost;
  console.log(
    `Sweeping ${formatEther(value)} ETH from ${wallet.account.address}`,
  );
  console.log(`  → ${dest} on ${robinhoodChain.name}`);
  const hash = await wallet.client.sendTransaction({
    to: dest as Address,
    value,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(
    `Done: ${robinhoodChain.blockExplorers!.default.url}/tx/${hash}`,
  );
}

main();
