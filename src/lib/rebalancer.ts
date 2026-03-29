export type Posture = "SELL MODE" | "NEUTRAL" | "ACCUMULATE MODE";
export type PoolState = "all_eth" | "all_usdc" | "in_range";

export interface PoolResult {
  name: string;
  state: PoolState;
  minRange: number;
  maxRange: number;
  targetEthWorth: number;
  ethNeeded: number;
  usdcNeeded: number;
}

export interface FeePoolSizing {
  spot: number;
  rangeMin: number;
  rangeMax: number;
  state: PoolState;
  targetPosition: {
    eth: number;
    usdc: number;
  };
  rebalance: {
    sellEth: number;
    buyEth: number;
    sellUsdc: number;
    buyUsdc: number;
    message: string;
  };
}

export interface RebalancePlan {
  posture: Posture;
  totalEthWorth: number;
  current: {
    eth: number;
    usdc: number;
    spot: number;
  };
  pools: PoolResult[];
  totals: {
    ethNeeded: number;
    usdcNeeded: number;
  };
  rebalance: {
    ethDelta: number;
    usdcDelta: number;
    message: string;
  };
}

interface BuildParams {
  currentEth: number;
  currentUsdc: number;
  spot: number;
}

const round = (n: number, d = 2): number => Number(n.toFixed(d));

function sizePositionFromEthWorth({
  ethWorth,
  P,
  a,
  b,
}: {
  ethWorth: number;
  P: number;
  a: number;
  b: number;
}) {
  const totalValueUSDC = ethWorth * P;

  if (P <= a) {
    return { state: "all_eth" as PoolState, ethNeeded: ethWorth, usdcNeeded: 0 };
  }

  if (P >= b) {
    return { state: "all_usdc" as PoolState, ethNeeded: 0, usdcNeeded: totalValueUSDC };
  }

  const sp = Math.sqrt(P);
  const sa = Math.sqrt(a);
  const sb = Math.sqrt(b);

  const usdcPerEth = (sp * sb * (sp - sa)) / (sb - sp);
  const ethNeeded = totalValueUSDC / (P + usdcPerEth);
  const usdcNeeded = ethNeeded * usdcPerEth;

  return { state: "in_range" as PoolState, ethNeeded, usdcNeeded };
}

export function buildUniswapV3Plan({
  currentEth,
  currentUsdc,
  spot,
}: BuildParams): RebalancePlan {
  if (spot <= 0) throw new Error("Spot price must be > 0");
  if (currentEth < 0 || currentUsdc < 0) throw new Error("Current holdings cannot be negative");

  const totalEthWorth = currentEth + currentUsdc / spot;

  let posture: Posture;
  if (totalEthWorth > 32) {
    posture = "SELL MODE";
  } else if (totalEthWorth < 32) {
    posture = "ACCUMULATE MODE";
  } else {
    posture = "NEUTRAL";
  }

  const postureAllocations: Record<Posture, Record<string, number>> = {
    "ACCUMULATE MODE": { drop: 0.40, base: 0.30, peak: 0.15, fee: 0.15 },
    "NEUTRAL":         { drop: 0.25, base: 0.35, peak: 0.25, fee: 0.15 },
    "SELL MODE":       { drop: 0.15, base: 0.30, peak: 0.40, fee: 0.15 },
  };

  const alloc = postureAllocations[posture];

  const poolDefs = [
    { name: "Fee Pool",  key: "fee",  min: spot * 0.95, max: spot * 1.05 },
    { name: "Base Pool", key: "base", min: spot * 0.85, max: spot * 1.15 },
    { name: "Drop Pool", key: "drop", min: spot * 0.75, max: spot * 0.90 },
    { name: "Peak Pool", key: "peak", min: spot * 1.10, max: spot * 1.40 },
  ];

  const plan = poolDefs.map((pool) => {
    const ethWorthForPool = totalEthWorth * alloc[pool.key];
    const sizing = sizePositionFromEthWorth({
      ethWorth: ethWorthForPool,
      P: spot,
      a: pool.min,
      b: pool.max,
    });

    return {
      name: pool.name,
      state: sizing.state,
      minRange: round(pool.min, 2),
      maxRange: round(pool.max, 2),
      targetEthWorth: round(ethWorthForPool, 6),
      ethNeeded: round(sizing.ethNeeded, 6),
      usdcNeeded: round(sizing.usdcNeeded, 2),
    };
  });

  const totalEthNeeded = plan.reduce((sum, p) => sum + p.ethNeeded, 0);
  const totalUsdcNeeded = plan.reduce((sum, p) => sum + p.usdcNeeded, 0);

  const ethDelta = totalEthNeeded - currentEth;
  const usdcDelta = totalUsdcNeeded - currentUsdc;

  let rebalanceMessage = "No conversion needed";
  if (ethDelta > 0 && usdcDelta < 0) {
    rebalanceMessage = `Need to convert ${round(-usdcDelta, 2)} USDC → ${round(ethDelta, 6)} ETH`;
  } else if (usdcDelta > 0 && ethDelta < 0) {
    rebalanceMessage = `Need to convert ${round(-ethDelta, 6)} ETH → ${round(usdcDelta, 2)} USDC`;
  } else if (Math.abs(ethDelta) < 0.00001 && Math.abs(usdcDelta) < 0.05) {
    rebalanceMessage = "No conversion needed";
  } else {
    rebalanceMessage = "Holdings do not reconcile cleanly; check rounding or pool assumptions";
  }

  return {
    posture,
    totalEthWorth: round(totalEthWorth, 6),
    current: {
      eth: round(currentEth, 6),
      usdc: round(currentUsdc, 2),
      spot: round(spot, 2),
    },
    pools: plan,
    totals: {
      ethNeeded: round(totalEthNeeded, 6),
      usdcNeeded: round(totalUsdcNeeded, 2),
    },
    rebalance: {
      ethDelta: round(ethDelta, 6),
      usdcDelta: round(usdcDelta, 2),
      message: rebalanceMessage,
    },
  };
}

export function sizeFeePoolFromWallet({
  walletEth,
  walletUsdc,
  spot,
}: {
  walletEth: number;
  walletUsdc: number;
  spot: number;
}): FeePoolSizing {
  if (spot <= 0) throw new Error("Spot price must be > 0");

  const rangeMin = spot * 0.95;
  const rangeMax = spot * 1.05;

  if (!(rangeMin < spot && spot < rangeMax)) {
    throw new Error("Spot price must be inside the fee pool range.");
  }

  const sqrtP = Math.sqrt(spot);
  const sqrtPa = Math.sqrt(rangeMin);
  const sqrtPb = Math.sqrt(rangeMax);

  const token0PerLiquidity = (sqrtPb - sqrtP) / (sqrtP * sqrtPb);
  const token1PerLiquidity = sqrtP - sqrtPa;
  const totalValueUsdc = walletEth * spot + walletUsdc;
  const liquidity = totalValueUsdc / (spot * token0PerLiquidity + token1PerLiquidity);

  const targetEth = liquidity * token0PerLiquidity;
  const targetUsdc = liquidity * token1PerLiquidity;

  const sellEth = Math.max(0, walletEth - targetEth);
  const buyEth = Math.max(0, targetEth - walletEth);
  const sellUsdc = Math.max(0, walletUsdc - targetUsdc);
  const buyUsdc = Math.max(0, targetUsdc - walletUsdc);

  let message = "No rebalance swap needed.";
  if (sellEth > 0) {
    message = `Swap first: SELL ${round(sellEth, 3)} ETH for about ${round(buyUsdc, 2)} USDC`;
  } else if (sellUsdc > 0) {
    message = `Swap first: SELL ${round(sellUsdc, 2)} USDC for about ${round(buyEth, 3)} ETH`;
  }

  return {
    spot: round(spot, 2),
    rangeMin: round(rangeMin, 2),
    rangeMax: round(rangeMax, 2),
    state: "in_range",
    targetPosition: {
      eth: round(targetEth, 8),
      usdc: round(targetUsdc, 2),
    },
    rebalance: {
      sellEth: round(sellEth, 8),
      buyEth: round(buyEth, 8),
      sellUsdc: round(sellUsdc, 2),
      buyUsdc: round(buyUsdc, 2),
      message,
    },
  };
}
