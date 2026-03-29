import type { WalletKey } from "../App";
import type { FeePoolSizing } from "../lib/rebalancer";

export interface InputValues {
  currentEth: string;
  currentUsdc: string;
  spot: string;
}

interface Props {
  selectedWallet: WalletKey;
  onWalletChange: (value: WalletKey) => void;
  onLoadPositions: () => void;
  lookupState: "idle" | "loading" | "success" | "error";
  lookupMessage: string | null;
  walletOptions: Record<WalletKey, { label: string; address: string }>;
  walletBalances: {
    eth: number;
    usdc: number;
  } | null;
  showRebalance: boolean;
  onRebalance: () => void;
  showFeePosition: boolean;
  onSizeFeePosition: () => void;
  feePositionResult: FeePoolSizing | null;
}

function formatUsd(value: number, decimals = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatEth(value: number, decimals = 3): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function getFeeActionLabel(result: FeePoolSizing): string {
  if (result.rebalance.sellEth > 0) {
    return `Sell ${formatEth(result.rebalance.sellEth)} ETH`;
  }

  if (result.rebalance.sellUsdc > 0) {
    return `Sell $${formatUsd(result.rebalance.sellUsdc, 0)} USDC`;
  }

  return "No swap needed";
}

export default function InputForm({
  selectedWallet,
  onWalletChange,
  onLoadPositions,
  lookupState,
  lookupMessage,
  walletOptions,
  walletBalances,
  showRebalance,
  onRebalance,
  showFeePosition,
  onSizeFeePosition,
  feePositionResult,
}: Props) {
  return (
    <div className="input-form">
      <div className="lookup-panel">
        <h2 className="section-title">Wallet Lookup</h2>
        <label htmlFor="walletSelect">Wallet</label>
        <div className="lookup-row">
          <select
            id="walletSelect"
            value={selectedWallet}
            onChange={(e) => onWalletChange(e.target.value as WalletKey)}
          >
            {Object.entries(walletOptions).map(([key, wallet]) => (
              <option key={key} value={key}>
                {wallet.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={onLoadPositions} disabled={lookupState === "loading"}>
            {lookupState === "loading" ? "Loading..." : "Load"}
          </button>
        </div>
        {walletBalances ? (
          <div className="table-wrap wallet-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ETH</th>
                  <th>USDC</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{formatEth(walletBalances.eth, 3)}</td>
                  <td>${formatUsd(walletBalances.usdc, 2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
        {lookupState === "error" && lookupMessage ? (
          <p className={`lookup-message lookup-message--${lookupState}`}>{lookupMessage}</p>
        ) : null}
        {lookupState === "success" && !showRebalance ? (
          <button type="button" className="rebalance-trigger-btn" onClick={onRebalance}>
            Plan All Pool Deposits
          </button>
        ) : null}
        {lookupState === "success" && !showFeePosition ? (
          <button type="button" className="rebalance-trigger-btn fee-position-btn" onClick={onSizeFeePosition}>
            Plan Fee Pool Deposit
          </button>
        ) : null}
        {feePositionResult ? (
          <div className="fee-position-panel">
            <h3 className="section-title">Fee Position Sizing</h3>
            <div className="fee-position-summary">
              <p className="fee-position-line">
                <span className="fee-position-label">Spot:</span>
                <span className="fee-position-value">${formatUsd(feePositionResult.spot)}</span>
              </p>
              <p className="fee-position-line">
                <span className="fee-position-label">Range:</span>
                <span className="fee-position-value">${formatUsd(feePositionResult.rangeMin)} - ${formatUsd(feePositionResult.rangeMax)}</span>
              </p>
              <p className="fee-position-line">
                <span className="fee-position-label">Target:</span>
                <span className="fee-position-value">{formatEth(feePositionResult.targetPosition.eth)} ETH + ${formatUsd(feePositionResult.targetPosition.usdc, 0)} USDC</span>
              </p>
              <p className="fee-position-line fee-position-swap">
                <span className="fee-position-label">Action:</span>
                <span className="fee-position-value">{getFeeActionLabel(feePositionResult)}</span>
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
