export interface PositionMathInput {
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  token0: { decimals: number };
  token1: { decimals: number };
}

function tickToSqrtPrice(tick: number): number {
  return Math.pow(1.0001, tick / 2);
}

export function calculateTokenAmounts(position: PositionMathInput, sqrtPriceX96: bigint) {
  const sqrtPrice = Number(sqrtPriceX96) / 2 ** 96;
  const sqrtA = tickToSqrtPrice(position.tickLower);
  const sqrtB = tickToSqrtPrice(position.tickUpper);
  const liquidity = Number(position.liquidity);

  const sqrtLower = Math.min(sqrtA, sqrtB);
  const sqrtUpper = Math.max(sqrtA, sqrtB);

  let amount0Raw = 0;
  let amount1Raw = 0;

  if (sqrtPrice <= sqrtLower) {
    amount0Raw = liquidity * ((sqrtUpper - sqrtLower) / (sqrtLower * sqrtUpper));
  } else if (sqrtPrice < sqrtUpper) {
    amount0Raw = liquidity * ((sqrtUpper - sqrtPrice) / (sqrtPrice * sqrtUpper));
    amount1Raw = liquidity * (sqrtPrice - sqrtLower);
  } else {
    amount1Raw = liquidity * (sqrtUpper - sqrtLower);
  }

  const amount0 = Math.max(amount0Raw, 0);
  const amount1 = Math.max(amount1Raw, 0);

  return {
    amount0Raw: amount0.toString(),
    amount1Raw: amount1.toString(),
    token0: amount0 / 10 ** position.token0.decimals,
    token1: amount1 / 10 ** position.token1.decimals,
  };
}
