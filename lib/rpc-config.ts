/** Shared server-only configuration. Never return the endpoint in API responses. */
export function resolveRpcUrl(value: string | undefined): string {
  if (!value?.trim()) throw new Error("Set ROBINFLY_RPC_URL to an authenticated Robinhood Chain mainnet endpoint.");
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("ROBINFLY_RPC_URL must be a valid HTTPS endpoint."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("ROBINFLY_RPC_URL must be an HTTPS endpoint without embedded credentials or fragments.");
  if (url.hostname === "rpc.mainnet.chain.robinhood.com") throw new Error("Configure an authenticated provider endpoint; the public RPC is unavailable for this worker.");
  return url.toString();
}

function causes(error: unknown): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  let item = error;
  while (item && typeof item === "object" && result.length < 20 && !result.includes(item as Record<string, unknown>)) {
    result.push(item as Record<string, unknown>);
    item = (item as Record<string, unknown>).cause;
  }
  return result;
}

export function rpcFailureStatus(error: unknown): 401 | 403 | 429 | null {
  for (const item of causes(error)) {
    const status = item.status ?? item.code;
    if (status === 401 || status === 403 || status === 429) return status;
  }
  return null;
}

export function isUnavailableRoute(error: unknown) {
  if (rpcFailureStatus(error)) return false;
  return causes(error).some(item => item.name === "ContractFunctionRevertedError" || item.name === "ContractFunctionZeroDataError");
}

/** Avoid provider URLs, API keys, RPC request bodies and challenge HTML in logs/feed. */
export function safeError(error: unknown): string {
  const status = rpcFailureStatus(error);
  if (status === 401 || status === 403) return `RPC access denied (${status}); observation paused until the provider configuration is corrected.`;
  if (status === 429) return "RPC usage limit reached (429); observation paused until provider capacity is reviewed.";
  const items = causes(error);
  if (items.some(item => typeof item.shortMessage === "string")) return `Provider or contract request failed (${String(items[0]?.name ?? "RequestError").replace(/[^a-zA-Z0-9]/g, "").slice(0, 60)}).`;
  const message = error instanceof Error ? error.message : "Unknown failure";
  return message.replace(/https?:\/\/\S+/gi, "[private endpoint]").replace(/0x[a-f\d]{64}/gi, "[redacted]").slice(0, 250);
}
