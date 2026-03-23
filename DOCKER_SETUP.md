# LP Rebalancer - RPi Docker Setup

This runs LP Rebalancer on your Raspberry Pi and serves it on port `5173`.

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
```

## 3. Build and run

```bash
docker compose up -d --build
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

Stop:

```bash
docker compose down
```

Restart after changes:

```bash
docker compose up -d --build
```

## Notes

- This is a static production build served by Nginx.
- SPA routing is supported via `nginx.conf` (`try_files ... /index.html`).
