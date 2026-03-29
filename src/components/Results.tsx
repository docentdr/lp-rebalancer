import { useEffect } from "react";
import type { RebalancePlan } from "../lib/rebalancer";
import type { PoolMonitorResult } from "../lib/poolMonitor";

const fmt = (n: number, decimals = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const fmtUsdRange = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });


interface Props {
  plan: RebalancePlan | null;
  monitor: PoolMonitorResult;
  showRebalance: boolean;
  totalHoldings: {
    eth: number;
    usdc: number;
    spot: number;
  };
}

export default function Results({ plan, monitor, showRebalance, totalHoldings }: Props) {
  const isSwapNeeded = plan ? !plan.rebalance.message.startsWith("No") : false;
  const hasValidSpot = Number.isFinite(totalHoldings.spot) && totalHoldings.spot > 0;
  const totalEthWorth = hasValidSpot
    ? totalHoldings.eth + totalHoldings.usdc / totalHoldings.spot
    : null;
  const totalUsdcWorth = hasValidSpot
    ? totalHoldings.eth * totalHoldings.spot + totalHoldings.usdc
    : null;
  const spotPriceDisplay = hasValidSpot ? `$${fmt(totalHoldings.spot, 2)}` : "--";
  const positionsSubtotal = monitor.positions.reduce(
    (totals, position) => ({
      eth: totals.eth + position.ethAmount,
      usdc: totals.usdc + position.usdcAmount,
      feesUsdc: totals.feesUsdc + position.feesUsdc,
    }),
    { eth: 0, usdc: 0, feesUsdc: 0 },
  );

  useEffect(() => {
    if (!plan) {
      return;
    }

    console.log("Posture mode:", plan.posture);
  }, [plan?.posture]);

  return (
    <div className="results">
      {totalEthWorth !== null && totalUsdcWorth !== null ? (
        <>
          <div className="summary-row summary-row--totals">
            <div className="stat-card stat-card--total stat-card--eth">
              <span className="stat-label">Total ETH Worth</span>
              <span className="stat-value">{fmt(totalEthWorth, 3)} ETH</span>
            </div>
            <div className="stat-card stat-card--total stat-card--usdc">
              <span className="stat-label">Total USDC Worth</span>
              <span className="stat-value">${fmt(totalUsdcWorth, 2)}</span>
            </div>
          </div>
        </>
      ) : null}

      <h3 className="section-title">Active Positions</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Range (USD)</th>
              <th>ETH</th>
              <th>USDC</th>
              <th>Fees (USDC)</th>
            </tr>
          </thead>
          <tbody>
            {[...monitor.positions].sort((a, b) => Number(BigInt(a.tokenId) - BigInt(b.tokenId))).map((position) => {
              const ethDisplay = fmt(position.ethAmount, 3);
              const usdcDisplay = `$${fmt(position.usdcAmount, 2)}`;
              const feesDisplay = `$${fmt(position.feesUsdc, 2)}`;

              return (
                <tr key={position.tokenId}>
                  <td>
                    <span className="range-cell">
                      <span>
                        {position.usdLower !== null && position.usdUpper !== null
                          ? `$${fmtUsdRange(position.usdLower)} - $${fmtUsdRange(position.usdUpper)}`
                          : `${position.tickLower} - ${position.tickUpper}`}
                      </span>
                      {position.inRange ? (
                        <span className="state-check" aria-label="In range" title="In range">✓</span>
                      ) : null}
                    </span>
                  </td>
                  <td>{ethDisplay}</td>
                  <td>{usdcDisplay}</td>
                  <td>{feesDisplay}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="totals-row">
              <td className="totals-cell totals-cell--spot">Spot: {spotPriceDisplay}</td>
              <td className="totals-cell totals-cell--eth">{fmt(positionsSubtotal.eth, 3)}</td>
              <td className="totals-cell totals-cell--usdc">${fmt(positionsSubtotal.usdc, 2)}</td>
              <td className="totals-cell totals-cell--usdc">${fmt(positionsSubtotal.feesUsdc, 2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {showRebalance && plan ? (
        <>
          <h3 className="section-title">All Pool Requirements</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pool</th>
                  <th>Range</th>
                  <th>ETH Needed</th>
                  <th>USDC Needed</th>
                  <th>% of Total Worth</th>
                </tr>
              </thead>
              <tbody>
                {plan.pools.map((pool) => (
                  <tr key={pool.name}>
                    <td className="pool-name">{pool.name}</td>
                    <td>
                      ${fmt(pool.minRange)} - ${fmt(pool.maxRange)}
                    </td>
                    <td>{fmt(pool.ethNeeded, 3)}</td>
                    <td>${fmt(pool.usdcNeeded, 2)}</td>
                    <td>{plan.totalEthWorth > 0 ? `${fmt((pool.targetEthWorth / plan.totalEthWorth) * 100, 1)}%` : "0.0%"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="totals-row">
                  <td className="totals-cell" colSpan={2}></td>
                  <td className="totals-cell totals-cell--eth">{fmt(plan.totals.ethNeeded, 3)}</td>
                  <td className="totals-cell totals-cell--usdc">${fmt(plan.totals.usdcNeeded, 2)}</td>
                  <td className="totals-cell"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : null}

      {showRebalance && plan ? (
        <div className={`rebalance-box ${isSwapNeeded ? "rebalance-box--action" : "rebalance-box--ok"}`}>
          <span className="rebalance-icon">{isSwapNeeded ? "⇄" : "✓"}</span>
          <span>{plan.rebalance.message}</span>
        </div>
      ) : null}

    </div>
  );
}
