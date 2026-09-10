import { decodeEventLog, parseAbi, type Address, type TransactionReceipt } from "viem";

const transferAbi = parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)"]);

/** Sum only this receipt's transfers, never unrelated wallet deposits. */
export function receivedTokens(receipt: Pick<TransactionReceipt, "logs">, token: Address, owner: Address): bigint {
  let net = 0n;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== token.toLowerCase()) continue;
    try {
      const event = decodeEventLog({ abi: transferAbi, data: log.data, topics: log.topics, strict: true });
      if (event.args.to.toLowerCase() === owner.toLowerCase()) net += event.args.value;
      if (event.args.from.toLowerCase() === owner.toLowerCase()) net -= event.args.value;
    } catch { /* Unrelated events on the token contract. */ }
  }
  return net;
}

export function receiptFee(receipt: Pick<TransactionReceipt, "gasUsed" | "effectiveGasPrice">): bigint {
  if (receipt.gasUsed < 0n || receipt.effectiveGasPrice < 0n) throw new Error("Invalid receipt gas accounting");
  return receipt.gasUsed * receipt.effectiveGasPrice;
}
