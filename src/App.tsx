import { useMemo, useState } from "react";
import InputForm from "./components/InputForm";
import Results from "./components/Results";
import { evaluatePoolRebalance } from "./lib/poolMonitor";
import { buildUniswapV3Plan, sizeFeePoolFromWallet, type FeePoolSizing } from "./lib/rebalancer";
import { loadWalletHoldings, type WalletHoldingsSummary } from "./lib/uniswapService";
import "./App.css";

type LookupState = "idle" | "loading" | "success" | "error";
export type WalletKey = "wallet1" | "wallet2";

const WALLET_OPTIONS: Record<WalletKey, { label: string; address: string }> = {
  wallet1: {
    label: import.meta.env.VITE_WALLET_1_LABEL ?? "Wallet 1",
    address: import.meta.env.VITE_WALLET_1_ADDRESS ?? "",
  },
  wallet2: {
    label: import.meta.env.VITE_WALLET_2_LABEL ?? "Wallet 2",
    address: import.meta.env.VITE_WALLET_2_ADDRESS ?? "",
  },
};

export default function App() {
  const [selectedWallet, setSelectedWallet] = useState<WalletKey>("wallet1");
  const [lookupState, setLookupState] = useState<LookupState>("idle");
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [lookupSummary, setLookupSummary] = useState<WalletHoldingsSummary | null>(null);
  const [showRebalance, setShowRebalance] = useState(false);
  const [showFeePosition, setShowFeePosition] = useState(false);

  async function handleLoadPositions() {
    const wallet = WALLET_OPTIONS[selectedWallet];
    const address = wallet.address;

    setLookupState("loading");
    setLookupMessage(null);
    setLookupSummary(null);

    try {
      const summary = await loadWalletHoldings(address);

      console.log("Uniswap positions loaded", {
        wallet: wallet.label,
        totalPositions: summary.totalPositionCount,
        activePositions: summary.activePositionCount,
        filteredOut: summary.totalPositionCount - summary.activePositionCount,
      });

      setLookupSummary(summary);
      setLookupState("success");
      setLookupMessage(null);
      setShowRebalance(false);
      setShowFeePosition(false);
    } catch (error) {
      setLookupState("error");
      setLookupSummary(null);
      setLookupMessage(error instanceof Error ? error.message : "Failed to load positions.");
    }
  }

  const result = useMemo(() => {
    if (!lookupSummary) return null;

    const eth = lookupSummary.breakdown.wallet.eth;
    const usdc = lookupSummary.breakdown.wallet.usdc;
    const spot = lookupSummary.spot;

    if ([eth, usdc, spot].some((v) => !Number.isFinite(v) || v < 0)) return null;
    if (spot <= 0) return null;

    try {
      return buildUniswapV3Plan({
        currentEth: eth,
        currentUsdc: usdc,
        spot,
      });
    } catch {
      return null;
    }
  }, [lookupSummary]);

  const monitor = useMemo(() => {
    if (!lookupSummary) return null;
    return evaluatePoolRebalance(lookupSummary);
  }, [lookupSummary]);

  const feePositionResult = useMemo((): FeePoolSizing | null => {
    if (!lookupSummary || !showFeePosition) return null;
    const spot = lookupSummary.spot;
    if (spot <= 0) return null;
    try {
      return sizeFeePoolFromWallet({
        walletEth: lookupSummary.breakdown.wallet.eth,
        walletUsdc: lookupSummary.breakdown.wallet.usdc,
        spot,
      });
    } catch {
      return null;
    }
  }, [lookupSummary, showFeePosition]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>LP Rebalancer</h1>
        <p>Uniswap V3 position sizing calculator</p>
      </header>
      <main className="app-body">
        <aside className="sidebar">
          <InputForm
            selectedWallet={selectedWallet}
            onWalletChange={setSelectedWallet}
            onLoadPositions={handleLoadPositions}
            lookupState={lookupState}
            lookupMessage={lookupMessage}
            walletOptions={WALLET_OPTIONS}
            walletBalances={lookupSummary ? {
              eth: lookupSummary.breakdown.wallet.eth,
              usdc: lookupSummary.breakdown.wallet.usdc,
            } : null}
            showRebalance={showRebalance}
            onRebalance={() => setShowRebalance(true)}
            showFeePosition={showFeePosition}
            onSizeFeePosition={() => setShowFeePosition(true)}
            feePositionResult={feePositionResult}
          />
        </aside>
        <section className="content">
          {lookupSummary && monitor ? (
            <Results
              plan={result}
              monitor={monitor}
              showRebalance={showRebalance}
              totalHoldings={{
                eth: lookupSummary.holdings.eth,
                usdc: lookupSummary.holdings.usdc,
                spot: lookupSummary.spot,
              }}
            />
          ) : (
            <div className="empty-state">
              <p>Use the load button to fetch wallet holdings.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
