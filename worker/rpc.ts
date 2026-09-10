import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRpcUrl } from "../lib/rpc-config";

loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), ".env"), quiet: true });
export const rpcUrl = () => resolveRpcUrl(process.env.ROBINFLY_RPC_URL);
