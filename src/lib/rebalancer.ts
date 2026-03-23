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
  neutralTolerance?: number;
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
  neutralTolerance = 0.25,
}: BuildParams): RebalancePlan {
  if (spot <= 0) throw new Error("Spot price must be > 0");
  if (currentEth < 0 || currentUsdc < 0) throw new Error("Current holdings cannot be negative");

  const totalEthWorth = currentEth + currentUsdc / spot;

  let posture: Posture;
  if (totalEthWorth > 32 + neutralTolerance) {
    posture = "SELL MODE";
  } else if (totalEthWorth < 32 - neutralTolerance) {
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
    rebalanceMessage = "Holdings do not reconcile cleanly; check rounding, posture tolerance, or pool assumptions";
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
