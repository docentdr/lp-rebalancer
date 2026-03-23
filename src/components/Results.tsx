import { useEffect } from "react";
import type { RebalancePlan } from "../lib/rebalancer";
import type { PoolMonitorResult } from "../lib/poolMonitor";

const POSTURE_CONFIG = {
  "ACCUMULATE MODE": { color: "#22c55e", bg: "rgba(34,197,94,0.12)", label: "▼ ACCUMULATE MODE" },
  "NEUTRAL":         { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", label: "◆ NEUTRAL"         },
  "SELL MODE":       { color: "#ef4444", bg: "rgba(239,68,68,0.12)",  label: "▲ SELL MODE"       },
};

const fmt = (n: number, decimals = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const fmtUsdRange = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const roundsToDisplayedZero = (n: number, decimals: number) =>
  Math.round(Math.abs(n) * 10 ** decimals) === 0;

interface Props {
  plan: RebalancePlan | null;
  monitor: PoolMonitorResult;
  walletBalances: {
    eth: number;
    usdc: number;
  };
}

const KIND_LABELS: Record<string, string> = {
  fee: "Fee",
  base: "Base",
  drop: "Drop",
  peak: "Peak",
  unclassified: "Unclassified",
};

export default function Results({ plan, monitor, walletBalances }: Props) {
  const postureCfg = plan ? POSTURE_CONFIG[plan.posture] : null;
  const isSwapNeeded = plan ? !plan.rebalance.message.startsWith("No") : false;
  const hasWarning = monitor.trigger !== "none";
  const spotPriceDisplay = plan ? `$${fmt(plan.current.spot, 2)}` : "--";
  const positionsSubtotal = monitor.positions.reduce(
    (totals, position) => ({
      eth: totals.eth + position.ethAmount,
      usdc: totals.usdc + position.usdcAmount,
    }),
    { eth: 0, usdc: 0 },
  );

  useEffect(() => {
    if (!plan) {
      return;
    }

    console.log("Posture mode:", plan.posture);
  }, [plan?.posture]);

  return (
    <div className="results">
      <div className={`trigger-box ${hasWarning ? "trigger-box--warn" : "trigger-box--ok"}`}>
        <span className="rebalance-icon">{hasWarning ? "!" : "✓"}</span>
        <span>{monitor.message}</span>
      </div>

      {plan && postureCfg ? (
        <>
          <div className="summary-row summary-row--totals">
            <div className="stat-card stat-card--total stat-card--eth">
              <span className="stat-label">Total ETH Worth</span>
              <span className="stat-value">{fmt(plan.totalEthWorth, 3)} ETH</span>
            </div>
            <div className="stat-card stat-card--total stat-card--usdc">
              <span className="stat-label">Total USDC Worth</span>
              <span className="stat-value">${fmt(plan.totalEthWorth * plan.current.spot, 2)}</span>
            </div>
          </div>
        </>
      ) : null}

      <h3 className="section-title">Active Positions</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Class</th>
              <th>In Range</th>
              <th>Range (USD)</th>
              <th>ETH</th>
              <th>USDC</th>
            </tr>
          </thead>
          <tbody>
            {monitor.positions.map((position) => {
              const hideRoundedZero =
                (position.poolKind === "peak" || position.poolKind === "drop");

              const ethDisplay = hideRoundedZero && roundsToDisplayedZero(position.ethAmount, 3)
                ? ""
                : fmt(position.ethAmount, 3);

              const usdcDisplay = hideRoundedZero && roundsToDisplayedZero(position.usdcAmount, 2)
                ? ""
                : `$${fmt(position.usdcAmount, 2)}`;

              return (
                <tr key={position.tokenId}>
                  <td>{KIND_LABELS[position.poolKind]}</td>
                  <td>
                    {position.inRange ? (
                      <span className="state-check" aria-label="In range" title="In range">✓</span>
                    ) : (
                      ""
                    )}
                  </td>
                  <td>
                    {position.usdLower !== null && position.usdUpper !== null
                      ? `$${fmtUsdRange(position.usdLower)} - $${fmtUsdRange(position.usdUpper)}`
                      : `${position.tickLower} - ${position.tickUpper}`}
                  </td>
                  <td>{ethDisplay}</td>
                  <td>{usdcDisplay}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="totals-row">
              <td colSpan={2}></td>
              <td className="totals-cell totals-cell--spot">Spot | {spotPriceDisplay}</td>
              <td className="totals-cell totals-cell--eth">Σ | {fmt(positionsSubtotal.eth, 3)}</td>
              <td className="totals-cell totals-cell--usdc">Σ | ${fmt(positionsSubtotal.usdc, 2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <h3 className="section-title">Wallet</h3>
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
              <td>{fmt(walletBalances.eth, 3)}</td>
              <td>${fmt(walletBalances.usdc, 2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {monitor.suggestions.length > 0 ? (
        <>
          <h3 className="section-title">
            {monitor.trigger === "fee_out_of_range" ? "Fee Pool Requirements" : "All Pool Requirements"}
          </h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pool</th>
                  <th>Range</th>
                  <th>Target (ETH)</th>
                  <th>ETH Needed</th>
                  <th>USDC Needed</th>
                  <th>USDC/ETH Ratio</th>
                </tr>
              </thead>
              <tbody>
                {monitor.suggestions.map((pool) => (
                  <tr key={pool.kind}>
                    <td className="pool-name">{pool.name}</td>
                    <td>
                      ${fmt(pool.minRange)} - ${fmt(pool.maxRange)}
                    </td>
                    <td>{fmt(pool.targetEthWorth, 3)}</td>
                    <td>{fmt(pool.ethNeeded, 3)}</td>
                    <td>${fmt(pool.usdcNeeded, 2)}</td>
                    <td>{fmt(pool.usdcPerEthRatio, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {plan && hasWarning ? (
        <div className={`rebalance-box ${isSwapNeeded ? "rebalance-box--action" : "rebalance-box--ok"}`}>
          <span className="rebalance-icon">{isSwapNeeded ? "⇄" : "✓"}</span>
          <span>{plan.rebalance.message}</span>
        </div>
      ) : null}

    </div>
  );
}
