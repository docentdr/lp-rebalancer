export const CHAIN_ID = 1;

export const UNISWAP_V3_ADDRESSES = {
  nonfungiblePositionManager: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  weth: "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
  usdc: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
} as const;

export const CACHE_TTL_MS = 60_000;
export const MAX_POSITIONS = 100;
export const MAX_UINT128 = (1n << 128n) - 1n;
