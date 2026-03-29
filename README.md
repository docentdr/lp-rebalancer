# LP Rebalancer

LP Rebalancer loads Uniswap V3 wallet positions, values them in ETH and USDC terms, and helps plan position sizing.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create your env file:

```bash
cp .env.example .env
```

3. Fill in at least:

- `VITE_ALCHEMY_API_KEY` (or full RPC URL)
- one or both wallet addresses (`VITE_WALLET_1_ADDRESS`, `VITE_WALLET_2_ADDRESS`)

4. Start UI locally:

```bash
npm run dev
```

## Daily Performance Snapshots (Headless)

The project includes a background snapshot job that runs without the UI and reuses the same wallet loading logic as the Load button.

Run one snapshot now:

```bash
npm run snapshot
```

Each run stores data in `data/snapshots/<wallet-label>/` for each configured wallet separately:

- `snapshots.jsonl`: append-only history (one JSON object per line)
- `snapshots.csv`: append-only totals table for quick charting
- `latest-snapshot.json`: most recent full snapshot

Each snapshot contains:

- total ETH worth and total USDC worth
- wallet balances (ETH, USDC)
- position balances (ETH, USDC)
- all active position details (token amounts, fees, valuation, ranges)

### Schedule Daily on macOS (cron)

Open your crontab:

```bash
crontab -e
```

Run every day at 00:05:

```cron
5 0 * * * cd /Users/umurbasar/dev/lp-rebalancer && /usr/bin/env npm run snapshot >> logs/snapshot-cron.log 2>&1
```

Make sure log folder exists once:

```bash
mkdir -p logs
```

Optional: verify cron registration:

```bash
crontab -l
```

## Build

```bash
npm run build
```
