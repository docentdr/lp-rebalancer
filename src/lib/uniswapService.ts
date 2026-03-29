import { Contract, ZeroAddress, formatUnits, getAddress, isAddress, type JsonRpcProvider } from "ethers";
import {
  ERC20_METADATA_ABI,
  NONFUNGIBLE_POSITION_MANAGER_ABI,
  UNISWAP_V3_FACTORY_ABI,
  UNISWAP_V3_POOL_ABI,
} from "./abis";
import { MAX_POSITIONS, MAX_UINT128, UNISWAP_V3_ADDRESSES } from "./constants";
import { getTokenPrices, type TokenPrice } from "./pricing";
import { getProvider } from "./provider";
import { calculateTokenAmounts as calculateLiquidityAmounts, type PositionMathInput } from "./uniswapMath";

export interface TokenMetadata {
  address: string;
  symbol: string;
  decimals: number;
}

export interface PoolPrice {
  sqrtPriceX96: string;
  tick: number;
  ratio: number;
}

export interface PositionAmounts {
  token0: number;
  token1: number;
  token0Raw: string;
  token1Raw: string;
}

export interface PositionFees {
  token0: number;
  token1: number;
  token0Raw: string;
  token1Raw: string;
}

export interface PositionDetails extends PositionMathInput {
  tokenId: string;
  token0: TokenMetadata;
  token1: TokenMetadata;
  fee: number;
  poolAddress: string;
  currentTick: number;
  inRange: boolean;
  amounts: PositionAmounts;
  fees: PositionFees;
  pool: PoolPrice;
}

export interface ValuedPosition extends PositionDetails {
  valuation: {
    usdc: number;
    eth: number;
    token0Price: TokenPrice;
    token1Price: TokenPrice;
  };
}

export interface PortfolioValuation {
  positions: ValuedPosition[];
  totals: {
    usdc: number;
    eth: number;
  };
  ethUsdPrice: number;
}

export interface WalletHoldingsSummary {
  address: string;
  tokenIds: string[];
  totalPositionCount: number;
  activePositionCount: number;
  positions: ValuedPosition[];
  totals: {
    usdc: number;
    eth: number;
  };
  holdings: {
    eth: number;
    usdc: number;
  };
  breakdown: {
    positions: {
      eth: number;
      usdc: number;
    };
    wallet: {
      eth: number;
      usdc: number;
    };
  };
  spot: number;
}

interface RawPositionResponse {
  token0: string;
  token1: string;
  fee: bigint;
  tickLower: bigint;
  tickUpper: bigint;
  liquidity: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
}

const tokenMetadataCache = new Map<string, TokenMetadata>();
const ERC20_BALANCE_OF_ABI = ["function balanceOf(address owner) view returns (uint256)"] as const;

function getContracts(provider: JsonRpcProvider) {
  const positionManager = new Contract(
    UNISWAP_V3_ADDRESSES.nonfungiblePositionManager,
    NONFUNGIBLE_POSITION_MANAGER_ABI,
    provider,
  );
  const factory = new Contract(UNISWAP_V3_ADDRESSES.factory, UNISWAP_V3_FACTORY_ABI, provider);

  return { positionManager, factory };
}

function hasExposure(position: PositionDetails): boolean {
  return BigInt(position.liquidity) > 0n || position.fees.token0 > 0 || position.fees.token1 > 0;
}

function aggregateTrackedHoldings(positions: PositionDetails[]) {
  const wethAddress = UNISWAP_V3_ADDRESSES.weth.toLowerCase();
  const usdcAddress = UNISWAP_V3_ADDRESSES.usdc.toLowerCase();

  return positions.reduce(
    (totals, position) => {
      const token0Amount = position.amounts.token0 + position.fees.token0;
      const token1Amount = position.amounts.token1 + position.fees.token1;

      if (position.token0.address.toLowerCase() === wethAddress) {
        totals.eth += token0Amount;
      }
      if (position.token1.address.toLowerCase() === wethAddress) {
        totals.eth += token1Amount;
      }
      if (position.token0.address.toLowerCase() === usdcAddress) {
        totals.usdc += token0Amount;
      }
      if (position.token1.address.toLowerCase() === usdcAddress) {
        totals.usdc += token1Amount;
      }

      return totals;
    },
    { eth: 0, usdc: 0 },
  );
}

async function getWalletTokenBalances(address: string, provider: JsonRpcProvider): Promise<{ eth: number; usdc: number }> {
  const [ethBalanceWei, usdcBalanceRaw] = await Promise.all([
    provider.getBalance(address),
    new Contract(UNISWAP_V3_ADDRESSES.usdc, ERC20_BALANCE_OF_ABI, provider).balanceOf(address),
  ]);

  return {
    eth: Number(formatUnits(ethBalanceWei, 18)),
    usdc: Number(formatUnits(usdcBalanceRaw as bigint, 6)),
  };
}

async function getTokenMetadata(address: string, provider: JsonRpcProvider): Promise<TokenMetadata> {
  const key = address.toLowerCase();
  if (tokenMetadataCache.has(key)) {
    return tokenMetadataCache.get(key)!;
  }

  const token = new Contract(address, ERC20_METADATA_ABI, provider);
  const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);

  const metadata = {
    address,
    symbol: String(symbol),
    decimals: Number(decimals),
  };

  tokenMetadataCache.set(key, metadata);
  return metadata;
}

async function estimateUncollectedFees(
  positionManager: Contract,
  tokenId: bigint,
  owner: string,
  fallback0: bigint,
  fallback1: bigint,
): Promise<{ amount0: bigint; amount1: bigint }> {
  try {
    const [amount0, amount1] = await positionManager.collect.staticCall(
      {
        tokenId,
        recipient: ZeroAddress,
        amount0Max: MAX_UINT128,
        amount1Max: MAX_UINT128,
      },
      {
        from: owner,
      },
    );

    return {
      amount0: amount0 as bigint,
      amount1: amount1 as bigint,
    };
  } catch {
    return {
      amount0: fallback0,
      amount1: fallback1,
    };
  }
}

export async function fetchPositions(address: string, provider: JsonRpcProvider = getProvider()): Promise<string[]> {
  const normalizedAddress = getAddress(address);
  const { positionManager } = getContracts(provider);
  const balance = (await positionManager.balanceOf(normalizedAddress)) as bigint;
  const count = Math.min(Number(balance), MAX_POSITIONS);
  const tokenIds: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const tokenId = (await positionManager.tokenOfOwnerByIndex(normalizedAddress, index)) as bigint;
    tokenIds.push(tokenId.toString());
  }

  return tokenIds;
}

export async function getPoolPrice(poolAddress: string, provider: JsonRpcProvider = getProvider()): Promise<PoolPrice> {
  if (!poolAddress || poolAddress === ZeroAddress) {
    throw new Error("Pool does not exist for this position.");
  }

  const pool = new Contract(poolAddress, UNISWAP_V3_POOL_ABI, provider);
  const slot0 = (await pool.slot0()) as { sqrtPriceX96: bigint; tick: bigint };

  const sqrtPrice = Number(slot0.sqrtPriceX96);
  const ratio = (sqrtPrice / 2 ** 96) ** 2;

  return {
    sqrtPriceX96: slot0.sqrtPriceX96.toString(),
    tick: Number(slot0.tick),
    ratio,
  };
}

export function calculateTokenAmounts(position: PositionMathInput, sqrtPriceX96: string) {
  return calculateLiquidityAmounts(position, BigInt(sqrtPriceX96));
}

export async function getPositionDetails(
  tokenId: string,
  ownerAddress: string,
  provider: JsonRpcProvider = getProvider(),
): Promise<PositionDetails> {
  const normalizedOwner = getAddress(ownerAddress);
  const { positionManager, factory } = getContracts(provider);
  const raw = (await positionManager.positions(BigInt(tokenId))) as RawPositionResponse;

  const [token0, token1] = await Promise.all([
    getTokenMetadata(raw.token0, provider),
    getTokenMetadata(raw.token1, provider),
  ]);

  const poolAddress = (await factory.getPool(raw.token0, raw.token1, raw.fee)) as string;
  const poolPrice = await getPoolPrice(poolAddress, provider);

  const position: Omit<PositionDetails, "amounts" | "fees" | "inRange" | "pool"> = {
    tokenId: tokenId.toString(),
    token0,
    token1,
    fee: Number(raw.fee),
    tickLower: Number(raw.tickLower),
    tickUpper: Number(raw.tickUpper),
    liquidity: raw.liquidity.toString(),
    poolAddress,
    currentTick: poolPrice.tick,
  };

  const amounts = calculateTokenAmounts(position, poolPrice.sqrtPriceX96);
  const feesRaw = await estimateUncollectedFees(
    positionManager,
    BigInt(tokenId),
    normalizedOwner,
    raw.tokensOwed0,
    raw.tokensOwed1,
  );

  const fees: PositionFees = {
    token0Raw: feesRaw.amount0.toString(),
    token1Raw: feesRaw.amount1.toString(),
    token0: Number(formatUnits(feesRaw.amount0, token0.decimals)),
    token1: Number(formatUnits(feesRaw.amount1, token1.decimals)),
  };

  return {
    ...position,
    inRange: poolPrice.tick >= position.tickLower && poolPrice.tick < position.tickUpper,
    amounts: {
      token0: amounts.token0,
      token1: amounts.token1,
      token0Raw: amounts.amount0Raw,
      token1Raw: amounts.amount1Raw,
    },
    fees,
    pool: poolPrice,
  };
}

export async function calculateTotalValue(positions: PositionDetails[]): Promise<PortfolioValuation> {
  const activePositions = positions.filter(hasExposure);

  if (activePositions.length === 0) {
    const prices = await getTokenPrices([UNISWAP_V3_ADDRESSES.weth]);
    const ethPrice = prices.get(UNISWAP_V3_ADDRESSES.weth.toLowerCase())?.usd ?? 0;

    return {
      positions: [],
      totals: { usdc: 0, eth: 0 },
      ethUsdPrice: ethPrice,
    };
  }

  const addresses = activePositions.flatMap((position) => [position.token0.address, position.token1.address]);
  const prices = await getTokenPrices(addresses);
  const ethPrice = prices.get(UNISWAP_V3_ADDRESSES.weth.toLowerCase())?.usd ?? 0;

  let totalUsd = 0;

  const valuedPositions: ValuedPosition[] = activePositions.map((position) => {
    const token0Price = prices.get(position.token0.address.toLowerCase()) ?? { usd: 0, eth: 0 };
    const token1Price = prices.get(position.token1.address.toLowerCase()) ?? { usd: 0, eth: 0 };

    const token0Amount = position.amounts.token0 + position.fees.token0;
    const token1Amount = position.amounts.token1 + position.fees.token1;

    const usdValue = token0Amount * token0Price.usd + token1Amount * token1Price.usd;
    const ethValue = token0Amount * token0Price.eth + token1Amount * token1Price.eth;

    totalUsd += usdValue;

    return {
      ...position,
      valuation: {
        usdc: usdValue,
        eth: ethValue,
        token0Price,
        token1Price,
      },
    };
  });

  const totalEth =
    ethPrice > 0 ? totalUsd / ethPrice : valuedPositions.reduce((acc, position) => acc + position.valuation.eth, 0);

  return {
    positions: valuedPositions,
    totals: {
      usdc: totalUsd,
      eth: totalEth,
    },
    ethUsdPrice: ethPrice,
  };
}

export async function loadWalletHoldings(
  address: string,
  provider: JsonRpcProvider = getProvider(),
): Promise<WalletHoldingsSummary> {
  if (!isAddress(address)) {
    throw new Error("Enter a valid Ethereum address.");
  }

  const normalizedAddress = getAddress(address);
  const tokenIds = await fetchPositions(normalizedAddress, provider);
  const positionDetails = await Promise.all(
    tokenIds.map((tokenId) => getPositionDetails(tokenId, normalizedAddress, provider)),
  );
  const activePositionDetails = positionDetails.filter(hasExposure);
  const valuation = await calculateTotalValue(activePositionDetails);
  const positionHoldings = aggregateTrackedHoldings(activePositionDetails);
  const walletHoldings = await getWalletTokenBalances(normalizedAddress, provider);

  const holdings = {
    eth: positionHoldings.eth + walletHoldings.eth,
    usdc: positionHoldings.usdc + walletHoldings.usdc,
  };

  return {
    address: normalizedAddress,
    tokenIds: activePositionDetails.map((position) => position.tokenId),
    totalPositionCount: tokenIds.length,
    activePositionCount: activePositionDetails.length,
    positions: valuation.positions,
    totals: valuation.totals,
    holdings,
    breakdown: {
      positions: positionHoldings,
      wallet: walletHoldings,
    },
    spot: valuation.ethUsdPrice,
  };
}
