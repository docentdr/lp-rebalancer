# LP Rebalancer - RPi Docker Setup

This setup runs two containers on your Raspberry Pi:

- `lp-rebalancer`: static UI on port `5173`
- `snapshot-cron`: background snapshot worker that runs once on startup and then daily

## Prerequisites

Your Raspberry Pi should have:
- Docker
- Docker Compose

## 1. Copy project to Pi

```bash
scp -r /Users/umurbasar/dev/lp-rebalancer umurb@anpsi.local:~/
```

## 2. SSH into Pi

```bash
ssh umurb@anpsi.local
cd ~/lp-rebalancer

# Optional: create .env from example if you do not have one yet
cp .env.example .env
```

Set these in `.env`:

- `VITE_ALCHEMY_API_KEY`
- `VITE_WALLET_1_LABEL=Umur`
- `VITE_WALLET_1_ADDRESS=...`
- `VITE_WALLET_2_LABEL=Zeynep`
- `VITE_WALLET_2_ADDRESS=...`

## 3. Build and run

```bash
docker compose up -d --build
```

The snapshot container will:

- run one snapshot immediately when it starts
- run daily at `00:05` by default

To change the schedule, set this in `docker-compose.yml` under `snapshot-cron.environment`:

```yaml
SNAPSHOT_CRON_SCHEDULE: "5 0 * * *"
```

## 4. Access the app

From your network:

```text
http://anpsi.local:5173
```

## Useful commands

View logs:

```bash
docker compose logs -f
```

Snapshot worker logs only:

```bash
docker compose logs -f snapshot-cron
```

Snapshot files on host:

```bash
ls -R data/snapshots
```

Stop:

```bash
docker compose down
```

Restart after changes:

```bash
docker compose up -d --build
```

## Notes

- UI is a static production build served by Nginx.
- SPA routing is supported via `nginx.conf` (`try_files ... /index.html`).
- Snapshot data is persisted on the host at `./data/snapshots` and split per wallet label.
