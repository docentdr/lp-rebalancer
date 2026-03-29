import { UNISWAP_V3_ADDRESSES } from "./constants";
import type { ValuedPosition, WalletHoldingsSummary } from "./uniswapService";

export interface ClassifiedPosition {
	tokenId: string;
	inRange: boolean;
	feeTier: number;
	tickLower: number;
	tickUpper: number;
	usdLower: number | null;
	usdUpper: number | null;
	currentTick: number;
	widthTicks: number;
	ethAmount: number;
	usdcAmount: number;
	feesUsdc: number;
}
export interface PoolMonitorResult {
	message: string;
	positions: ClassifiedPosition[];
}

interface Exposure {
	ethAmount: number;
	usdcAmount: number;
}

function tickToToken1PerToken0(tick: number, token0Decimals: number, token1Decimals: number): number {
	return Math.pow(1.0001, tick) * Math.pow(10, token0Decimals - token1Decimals);
}

function getUsdRangeFromTicks(position: ValuedPosition): { usdLower: number; usdUpper: number } | null {
	const wethAddress = UNISWAP_V3_ADDRESSES.weth.toLowerCase();
	const usdcAddress = UNISWAP_V3_ADDRESSES.usdc.toLowerCase();
	const token0 = position.token0.address.toLowerCase();
	const token1 = position.token1.address.toLowerCase();

	const isWethUsdcPair =
		(token0 === wethAddress && token1 === usdcAddress) ||
		(token0 === usdcAddress && token1 === wethAddress);

	if (!isWethUsdcPair) {
		return null;
	}

	const lowerToken1PerToken0 = tickToToken1PerToken0(
		position.tickLower,
		position.token0.decimals,
		position.token1.decimals,
	);
	const upperToken1PerToken0 = tickToToken1PerToken0(
		position.tickUpper,
		position.token0.decimals,
		position.token1.decimals,
	);

	let lowerUsd: number;
	let upperUsd: number;

	if (token0 === wethAddress && token1 === usdcAddress) {
		lowerUsd = lowerToken1PerToken0;
		upperUsd = upperToken1PerToken0;
	} else {
		lowerUsd = 1 / lowerToken1PerToken0;
		upperUsd = 1 / upperToken1PerToken0;
	}

	const usdLower = Math.min(lowerUsd, upperUsd);
	const usdUpper = Math.max(lowerUsd, upperUsd);

	if (!Number.isFinite(usdLower) || !Number.isFinite(usdUpper) || usdLower <= 0 || usdUpper <= 0) {
		return null;
	}

	return { usdLower, usdUpper };
}

function getPositionExposure(position: ValuedPosition): Exposure {
	const wethAddress = UNISWAP_V3_ADDRESSES.weth.toLowerCase();
	const usdcAddress = UNISWAP_V3_ADDRESSES.usdc.toLowerCase();

	let ethAmount = 0;
	let usdcAmount = 0;

	const token0Amount = position.amounts.token0 + position.fees.token0;
	const token1Amount = position.amounts.token1 + position.fees.token1;

	if (position.token0.address.toLowerCase() === wethAddress) {
		ethAmount += token0Amount;
	}
	if (position.token1.address.toLowerCase() === wethAddress) {
		ethAmount += token1Amount;
	}
	if (position.token0.address.toLowerCase() === usdcAddress) {
		usdcAmount += token0Amount;
	}
	if (position.token1.address.toLowerCase() === usdcAddress) {
		usdcAmount += token1Amount;
	}

	return { ethAmount, usdcAmount };
}

function getAccumulatedFeesUsdc(position: ValuedPosition): number {
	return position.fees.token0 * position.valuation.token0Price.usd + position.fees.token1 * position.valuation.token1Price.usd;
}

export function evaluatePoolRebalance(summary: WalletHoldingsSummary): PoolMonitorResult {
	const classifiedPositions: ClassifiedPosition[] = summary.positions.map((position) => {
		const exposure = getPositionExposure(position);
		const usdRange = getUsdRangeFromTicks(position);
		const feesUsdc = getAccumulatedFeesUsdc(position);

		return {
			tokenId: position.tokenId,
			inRange: position.inRange,
			feeTier: position.fee,
			tickLower: position.tickLower,
			tickUpper: position.tickUpper,
			usdLower: usdRange?.usdLower ?? null,
			usdUpper: usdRange?.usdUpper ?? null,
			currentTick: position.currentTick,
			widthTicks: Math.max(position.tickUpper - position.tickLower, 0),
			ethAmount: exposure.ethAmount,
			usdcAmount: exposure.usdcAmount,
			feesUsdc,
		};
	});

	return {
		message: "Wallet positions loaded. Use Plan All Pool Deposits to generate the 4-pool target allocation.",
		positions: classifiedPositions,
	};
}
