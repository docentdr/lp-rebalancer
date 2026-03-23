import { UNISWAP_V3_ADDRESSES } from "./constants";

const DEFILLAMA_BASE = "https://coins.llama.fi";
const MAX_ADDRESSES_PER_REQUEST = 40;

export interface TokenPrice {
  usd: number;
  eth: number;
}

type DefiLlamaPriceResponse = {
  coins?: Record<string, { price?: number }>;
};

function isAddressLike(value: string | undefined): value is string {
  return /^0x[a-fA-F0-9]{40}$/.test(value ?? "");
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchEthUsdFromDefiLlama(): Promise<number> {
  const response = await fetch(`${DEFILLAMA_BASE}/prices/current/coingecko:ethereum`);
  if (!response.ok) {
    return 0;
  }

  const json = (await response.json()) as DefiLlamaPriceResponse;
  return Number(json.coins?.["coingecko:ethereum"]?.price ?? 0);
}

async function fetchTokenPricesFromDefiLlama(addresses: string[], ethUsdPrice: number): Promise<Map<string, TokenPrice>> {
  if (addresses.length === 0) {
    return new Map();
  }

  const prices = new Map<string, TokenPrice>();
  const keys = addresses.map((address) => `ethereum:${address}`);
  const chunks = chunkArray(keys, MAX_ADDRESSES_PER_REQUEST);

  for (const chunk of chunks) {
    const endpoint = `${DEFILLAMA_BASE}/prices/current/${encodeURIComponent(chunk.join(","))}`;
    const response = await fetch(endpoint);

    if (!response.ok) {
      continue;
    }

    const json = (await response.json()) as DefiLlamaPriceResponse;
    const coins = json.coins ?? {};

    for (const [key, value] of Object.entries(coins)) {
      const [, address] = key.split(":");
      if (!address) {
        continue;
      }

      const usd = Number(value.price ?? 0);
      prices.set(address.toLowerCase(), {
        usd,
        eth: ethUsdPrice > 0 ? usd / ethUsdPrice : 0,
      });
    }
  }

  return prices;
}

export async function getTokenPrices(addresses: string[]): Promise<Map<string, TokenPrice>> {
  const normalized = [
    ...new Set(
      addresses
        .filter((address): address is string => isAddressLike(address))
        .map((address) => address.toLowerCase()),
    ),
  ];

  if (normalized.length === 0) {
    return new Map();
  }

  const ethUsd = await fetchEthUsdFromDefiLlama();
  const prices = await fetchTokenPricesFromDefiLlama(normalized, ethUsd);

  if (!prices.has(UNISWAP_V3_ADDRESSES.weth.toLowerCase()) && ethUsd > 0) {
    prices.set(UNISWAP_V3_ADDRESSES.weth.toLowerCase(), {
      usd: ethUsd,
      eth: 1,
    });
  }

  if (prices.size === 0) {
    throw new Error("Failed to fetch token prices from DefiLlama.");
  }

  return prices;
}
