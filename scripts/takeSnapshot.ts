import { config as loadEnv } from "dotenv";
import { JsonRpcProvider, getAddress, isAddress } from "ethers";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHAIN_ID } from "../src/lib/constants.ts";
import { loadWalletHoldings } from "../src/lib/uniswapService.ts";

interface WalletConfig {
  key: string;
  label: string;
  address: string;
}

interface WalletSnapshot {
  key: string;
  label: string;
  address: string;
  timestamp: string;
  spotEthUsd: number;
  totalEthWorth: number;
  totalUsdcWorth: number;
  totalUsdValue: number;
  totalPositionCount: number;
  activePositionCount: number;
  walletBalances: {
    eth: number;
    usdc: number;
  };
  positionBalances: {
    eth: number;
    usdc: number;
  };
  positions: Array<{
    tokenId: string;
    inRange: boolean;
    feeBps: number;
    tickLower: number;
    tickUpper: number;
    currentTick: number;
    token0: { address: string; symbol: string; decimals: number };
    token1: { address: string; symbol: string; decimals: number };
    amounts: { token0: number; token1: number; token0Raw: string; token1Raw: string };
    fees: { token0: number; token1: number; token0Raw: string; token1Raw: string };
    valuation: {
      usdc: number;
      eth: number;
      token0Price: { usd: number; eth: number };
      token1Price: { usd: number; eth: number };
    };
  }>;
}

interface SnapshotRunResult {
  timestamp: string;
  chainId: number;
  wallets: WalletSnapshot[];
}

function normalizeEnvValue(value: string | undefined): string {
  return value?.trim() ?? "";
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function resolveRpcUrl(): string {
  const configuredUrl = normalizeEnvValue(process.env.VITE_RPC_URL);
  if (configuredUrl && !configuredUrl.includes("YOUR_ALCHEMY_API_KEY")) {
    return configuredUrl;
  }

  const alchemyApiKey = normalizeEnvValue(process.env.VITE_ALCHEMY_API_KEY);
  if (alchemyApiKey && !alchemyApiKey.includes("YOUR_ALCHEMY_API_KEY")) {
    if (isHttpUrl(alchemyApiKey)) {
      return alchemyApiKey;
    }

    return `https://eth-mainnet.g.alchemy.com/v2/${alchemyApiKey}`;
  }

  throw new Error(
    "Missing RPC configuration. Set VITE_ALCHEMY_API_KEY to either an Alchemy key or full RPC URL, or set VITE_RPC_URL.",
  );
}

function loadWalletConfigs(): WalletConfig[] {
  const candidates: WalletConfig[] = [
    {
      key: "wallet1",
      label: normalizeEnvValue(process.env.VITE_WALLET_1_LABEL) || "Wallet 1",
      address: normalizeEnvValue(process.env.VITE_WALLET_1_ADDRESS),
    },
    {
      key: "wallet2",
      label: normalizeEnvValue(process.env.VITE_WALLET_2_LABEL) || "Wallet 2",
      address: normalizeEnvValue(process.env.VITE_WALLET_2_ADDRESS),
    },
  ];

  const configured = candidates.filter((wallet) => wallet.address.length > 0);
  if (configured.length === 0) {
    throw new Error(
      "No wallet addresses configured. Set at least one of VITE_WALLET_1_ADDRESS or VITE_WALLET_2_ADDRESS.",
    );
  }

  const invalid = configured.filter((wallet) => !isAddress(wallet.address));
  if (invalid.length > 0) {
    const names = invalid.map((wallet) => wallet.key).join(", ");
    throw new Error(`Invalid wallet address configured for: ${names}.`);
  }

  return configured.map((wallet) => ({
    ...wallet,
    address: getAddress(wallet.address),
  }));
}

function round(value: number, decimals = 8): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(decimals));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "wallet";
}

function toCsvRow(snapshot: WalletSnapshot): string {
  return [
    snapshot.timestamp,
    snapshot.key,
    snapshot.label,
    snapshot.address,
    snapshot.spotEthUsd,
    snapshot.totalEthWorth,
    snapshot.totalUsdcWorth,
    snapshot.totalUsdValue,
    snapshot.totalPositionCount,
    snapshot.activePositionCount,
    snapshot.walletBalances.eth,
    snapshot.walletBalances.usdc,
    snapshot.positionBalances.eth,
    snapshot.positionBalances.usdc,
  ].join(",");
}

async function appendCsv(csvPath: string, snapshot: WalletSnapshot): Promise<void> {
  const header =
    "timestamp,walletKey,walletLabel,address,spotEthUsd,totalEthWorth,totalUsdcWorth,totalUsdValue,totalPositionCount,activePositionCount,walletEth,walletUsdc,positionsEth,positionsUsdc\n";

  let shouldWriteHeader = false;
  try {
    await readFile(csvPath, "utf8");
  } catch {
    shouldWriteHeader = true;
  }

  if (shouldWriteHeader) {
    await appendFile(csvPath, header, "utf8");
  }

  await appendFile(csvPath, `${toCsvRow(snapshot)}\n`, "utf8");
}

async function writeWalletSnapshot(outputDir: string, snapshot: WalletSnapshot): Promise<void> {
  const walletSlug = slugify(snapshot.label || snapshot.key);
  const walletDir = path.join(outputDir, walletSlug);
  await mkdir(walletDir, { recursive: true });

  const historyJsonlPath = path.join(walletDir, "snapshots.jsonl");
  const latestJsonPath = path.join(walletDir, "latest-snapshot.json");
  const historyCsvPath = path.join(walletDir, "snapshots.csv");

  await appendFile(historyJsonlPath, `${JSON.stringify(snapshot)}\n`, "utf8");
  await writeFile(latestJsonPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await appendCsv(historyCsvPath, snapshot);
}

export async function takeSnapshot(): Promise<SnapshotRunResult> {
  loadEnv();
  loadEnv({ path: ".env.local", override: true });

  const walletConfigs = loadWalletConfigs();
  const provider = new JsonRpcProvider(resolveRpcUrl(), CHAIN_ID);
  const timestamp = new Date().toISOString();

  const wallets: WalletSnapshot[] = [];

  for (const wallet of walletConfigs) {
    const summary = await loadWalletHoldings(wallet.address, provider);
    wallets.push({
      key: wallet.key,
      label: wallet.label,
      address: wallet.address,
      timestamp,
      spotEthUsd: round(summary.spot, 4),
      totalEthWorth: round(summary.holdings.eth),
      totalUsdcWorth: round(summary.holdings.usdc, 2),
      totalUsdValue: round(summary.holdings.eth * summary.spot + summary.holdings.usdc, 2),
      totalPositionCount: summary.totalPositionCount,
      activePositionCount: summary.activePositionCount,
      walletBalances: {
        eth: round(summary.breakdown.wallet.eth),
        usdc: round(summary.breakdown.wallet.usdc, 2),
      },
      positionBalances: {
        eth: round(summary.breakdown.positions.eth),
        usdc: round(summary.breakdown.positions.usdc, 2),
      },
      positions: summary.positions.map((position) => ({
        tokenId: position.tokenId,
        inRange: position.inRange,
        feeBps: position.fee,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        currentTick: position.currentTick,
        token0: {
          address: position.token0.address,
          symbol: position.token0.symbol,
          decimals: position.token0.decimals,
        },
        token1: {
          address: position.token1.address,
          symbol: position.token1.symbol,
          decimals: position.token1.decimals,
        },
        amounts: {
          token0: round(position.amounts.token0),
          token1: round(position.amounts.token1),
          token0Raw: position.amounts.token0Raw,
          token1Raw: position.amounts.token1Raw,
        },
        fees: {
          token0: round(position.fees.token0),
          token1: round(position.fees.token1),
          token0Raw: position.fees.token0Raw,
          token1Raw: position.fees.token1Raw,
        },
        valuation: {
          usdc: round(position.valuation.usdc, 2),
          eth: round(position.valuation.eth),
          token0Price: {
            usd: round(position.valuation.token0Price.usd, 6),
            eth: round(position.valuation.token0Price.eth, 8),
          },
          token1Price: {
            usd: round(position.valuation.token1Price.usd, 6),
            eth: round(position.valuation.token1Price.eth, 8),
          },
        },
      })),
    });
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(scriptDir, "..");
  const outputDir =
    normalizeEnvValue(process.env.SNAPSHOT_OUTPUT_DIR) || path.join(projectRoot, "data", "snapshots");

  await mkdir(outputDir, { recursive: true });

  for (const wallet of wallets) {
    await writeWalletSnapshot(outputDir, wallet);
  }

  return {
    timestamp,
    chainId: CHAIN_ID,
    wallets,
  };
}

async function main(): Promise<void> {
  const result = await takeSnapshot();
  const summary = result.wallets
    .map(
      (wallet) =>
        `${wallet.label}: TOTAL ETH WORTH=${wallet.totalEthWorth}, TOTAL USDC WORTH=${wallet.totalUsdcWorth}`,
    )
    .join(" | ");

  console.log(`Snapshots saved at ${result.timestamp} | ${summary}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Snapshot job failed: ${message}`);
  process.exitCode = 1;
});
