import { JsonRpcProvider } from "ethers";
import { CHAIN_ID } from "./constants";

function normalizeEnvValue(value: string | undefined): string {
  return value?.trim() ?? "";
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function getRpcUrl(): string {
  const configuredUrl = normalizeEnvValue(import.meta.env.VITE_RPC_URL);
  if (configuredUrl && !configuredUrl.includes("YOUR_ALCHEMY_API_KEY")) {
    return configuredUrl;
  }

  const alchemyApiKey = normalizeEnvValue(import.meta.env.VITE_ALCHEMY_API_KEY);
  if (alchemyApiKey && !alchemyApiKey.includes("YOUR_ALCHEMY_API_KEY")) {
    if (isHttpUrl(alchemyApiKey)) {
      return alchemyApiKey;
    }

    return `https://eth-mainnet.g.alchemy.com/v2/${alchemyApiKey}`;
  }

  throw new Error(
    "Missing RPC configuration. Set VITE_ALCHEMY_API_KEY to either an Alchemy key or full RPC URL, or set VITE_RPC_URL in your .env and restart the dev server.",
  );
}

export function getProvider(): JsonRpcProvider {
  return new JsonRpcProvider(getRpcUrl(), CHAIN_ID);
}
