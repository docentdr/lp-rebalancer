import { useMemo, useState } from "react";
import InputForm, { type InputValues } from "./components/InputForm";
import Results from "./components/Results";
import { APP_CONFIG } from "./config";
import { evaluatePoolRebalance } from "./lib/poolMonitor";
import { buildUniswapV3Plan } from "./lib/rebalancer";
import { loadWalletHoldings, type WalletHoldingsSummary } from "./lib/uniswapService";
import "./App.css";

const DEFAULTS: InputValues = {
  currentEth: "",
  currentUsdc: "",
  spot: "",
};

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

function formatInput(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\.0+$|(?<=\.[0-9]*?)0+$/u, "").replace(/\.$/u, "");
}

export default function App() {
  const [inputs, setInputs] = useState<InputValues>(DEFAULTS);
  const [selectedWallet, setSelectedWallet] = useState<WalletKey>("wallet1");
  const [lookupState, setLookupState] = useState<LookupState>("idle");
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [lookupSummary, setLookupSummary] = useState<WalletHoldingsSummary | null>(null);

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

      setInputs((current) => ({
        currentEth: formatInput(summary.holdings.eth, 6),
        currentUsdc: formatInput(summary.holdings.usdc, 2),
        spot: summary.spot > 0 ? formatInput(summary.spot, 2) : current.spot,
      }));
      setLookupSummary(summary);
      setLookupState("success");
      setLookupMessage(null);
    } catch (error) {
      setLookupState("error");
      setLookupSummary(null);
      setLookupMessage(error instanceof Error ? error.message : "Failed to load positions.");
    }
  }

  const result = useMemo(() => {
    const eth = parseFloat(inputs.currentEth);
    const usdc = parseFloat(inputs.currentUsdc);
    const spot = parseFloat(inputs.spot);

    if ([eth, usdc, spot].some((v) => isNaN(v) || v < 0)) return null;
    if (spot <= 0) return null;

    try {
      return buildUniswapV3Plan({
        currentEth: eth,
        currentUsdc: usdc,
        spot,
        neutralTolerance: APP_CONFIG.neutralTolerance,
      });
    } catch {
      return null;
    }
  }, [inputs]);

  const monitor = useMemo(() => {
    if (!lookupSummary) return null;
    return evaluatePoolRebalance(lookupSummary, APP_CONFIG.neutralTolerance);
  }, [lookupSummary]);

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
          />
        </aside>
        <section className="content">
          {lookupSummary && monitor ? (
            <Results
              plan={result}
              monitor={monitor}
              walletBalances={{
                eth: lookupSummary.breakdown.wallet.eth,
                usdc: lookupSummary.breakdown.wallet.usdc,
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
