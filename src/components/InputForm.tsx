import type { WalletKey } from "../App";

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
}

export default function InputForm({
  selectedWallet,
  onWalletChange,
  onLoadPositions,
  lookupState,
  lookupMessage,
  walletOptions,
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
        {lookupState === "error" && lookupMessage ? (
          <p className={`lookup-message lookup-message--${lookupState}`}>{lookupMessage}</p>
        ) : null}
      </div>
    </div>
  );
}
