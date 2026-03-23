import { UNISWAP_V3_ADDRESSES } from "./constants";
import { buildUniswapV3Plan } from "./rebalancer";
import type { ValuedPosition, WalletHoldingsSummary } from "./uniswapService";

export type PoolKind = "fee" | "base" | "drop" | "peak";
export type RebalanceTrigger = "none" | "fee_out_of_range" | "base_out_of_range";

export interface ClassifiedPosition {
	tokenId: string;
	poolKind: PoolKind | "unclassified";
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
}

export interface PoolSuggestion {
	kind: PoolKind;
	name: string;
	minRange: number;
	maxRange: number;
	targetEthWorth: number;
	ethNeeded: number;
	usdcNeeded: number;
	usdcPerEthRatio: number;
}

export interface PoolMonitorResult {
	trigger: RebalanceTrigger;
	message: string;
	positions: ClassifiedPosition[];
	suggestions: PoolSuggestion[];
}

interface IndexedPosition {
	index: number;
	position: ValuedPosition;
	widthTicks: number;
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

function createSuggestionMap(summary: WalletHoldingsSummary, neutralTolerance: number): Map<PoolKind, PoolSuggestion> {
	const spot = summary.spot;
	if (!Number.isFinite(spot) || spot <= 0) {
		return new Map();
	}

	const plan = buildUniswapV3Plan({
		currentEth: summary.holdings.eth,
		currentUsdc: summary.holdings.usdc,
		spot,
		neutralTolerance,
	});

	const byName: Record<string, PoolKind> = {
		"Fee Pool": "fee",
		"Base Pool": "base",
		"Drop Pool": "drop",
		"Peak Pool": "peak",
	};

	return new Map(
		plan.pools
			.filter((pool) => byName[pool.name] !== undefined)
			.map((pool) => {
				const kind = byName[pool.name];
				const usdcPerEthRatio = pool.ethNeeded > 0 ? pool.usdcNeeded / pool.ethNeeded : 0;

				return [
					kind,
					{
						kind,
						name: pool.name,
						minRange: pool.minRange,
						maxRange: pool.maxRange,
						targetEthWorth: pool.targetEthWorth,
						ethNeeded: pool.ethNeeded,
						usdcNeeded: pool.usdcNeeded,
						usdcPerEthRatio,
					},
				] as const;
			}),
	);
}

function classifyPools(positions: ValuedPosition[]): Map<number, PoolKind> {
	const below: IndexedPosition[] = [];
	const above: IndexedPosition[] = [];
	const around: IndexedPosition[] = [];

	positions.forEach((position, index) => {
		const widthTicks = Math.max(position.tickUpper - position.tickLower, 0);
		const indexed: IndexedPosition = { index, position, widthTicks };

		if (position.tickUpper <= position.currentTick) {
			below.push(indexed);
			return;
		}

		if (position.tickLower > position.currentTick) {
			above.push(indexed);
			return;
		}

		around.push(indexed);
	});

	around.sort((a, b) => a.widthTicks - b.widthTicks);
	below.sort((a, b) => b.position.tickUpper - a.position.tickUpper);
	above.sort((a, b) => a.position.tickLower - b.position.tickLower);

	const classification = new Map<number, PoolKind>();

	if (around[0]) classification.set(around[0].index, "fee");
	if (around[1]) classification.set(around[1].index, "base");
	if (below[0]) classification.set(below[0].index, "drop");
	if (above[0]) classification.set(above[0].index, "peak");

	return classification;
}

function selectTrigger(positions: ClassifiedPosition[]): RebalanceTrigger {
	const basePool = positions.find((position) => position.poolKind === "base");
	if (basePool && !basePool.inRange) {
		return "base_out_of_range";
	}

	const feePool = positions.find((position) => position.poolKind === "fee");
	if (feePool && !feePool.inRange) {
		return "fee_out_of_range";
	}

	return "none";
}

function hasClearFourPoolClassification(positions: ClassifiedPosition[]): boolean {
	if (positions.length !== 4) {
		return false;
	}

	const kinds = new Set<PoolKind | "unclassified">(positions.map((position) => position.poolKind));
	return kinds.has("fee") && kinds.has("base") && kinds.has("drop") && kinds.has("peak") && !kinds.has("unclassified");
}

export function evaluatePoolRebalance(summary: WalletHoldingsSummary, neutralTolerance: number): PoolMonitorResult {
	const poolKindsByIndex = classifyPools(summary.positions);

	const classifiedPositions: ClassifiedPosition[] = summary.positions.map((position, index) => {
		const exposure = getPositionExposure(position);
		const usdRange = getUsdRangeFromTicks(position);

		return {
			tokenId: position.tokenId,
			poolKind: poolKindsByIndex.get(index) ?? "unclassified",
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
		};
	});

	const trigger = selectTrigger(classifiedPositions);
	const suggestionMap = createSuggestionMap(summary, neutralTolerance);
	const clearFourPoolSetup = hasClearFourPoolClassification(classifiedPositions);

	if (!clearFourPoolSetup) {
		return {
			trigger: "base_out_of_range",
			message:
				"Could not clearly identify all 4 pools (fee/base/drop/peak). Assuming base setup needs readjustment and suggesting full pool setup below.",
			positions: classifiedPositions,
			suggestions: ["fee", "base", "drop", "peak"]
				.map((kind) => suggestionMap.get(kind as PoolKind))
				.filter(Boolean) as PoolSuggestion[],
		};
	}

	if (trigger === "fee_out_of_range") {
		const feeSuggestion = suggestionMap.get("fee");
		return {
			trigger,
			message:
				"Fee pool is out of range. Reposition only the fee pool using the suggested range and ETH/USDC split below.",
			positions: classifiedPositions,
			suggestions: feeSuggestion ? [feeSuggestion] : [],
		};
	}

	if (trigger === "base_out_of_range") {
		return {
			trigger,
			message:
				"Base pool is out of range. Rebalance all pools using the suggested ranges and ETH/USDC ratios below.",
			positions: classifiedPositions,
			suggestions: ["fee", "base", "drop", "peak"].map((kind) => suggestionMap.get(kind as PoolKind)).filter(Boolean) as PoolSuggestion[],
		};
	}

	return {
		trigger: "none",
		message: "No readjustment required. All key pools are in range or no trigger pool is out of range.",
		positions: classifiedPositions,
		suggestions: [],
	};
}
