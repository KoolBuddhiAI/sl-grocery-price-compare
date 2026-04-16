# Keells Standalone Capture Setup

Self-bootstrapping script that runs on any macOS/Linux machine with zero prior setup. On first run it installs Node.js, clones the repo, captures Keells prices, pushes to Cloudflare, and sets up a daily cron.

## Quick Start

Copy `scripts/keells-standalone.sh` to the target machine and run:

```bash
bash keells-standalone.sh
```

That's it. Everything else is automatic.

## What It Does

### First Run

1. **Checks Node.js** — installs Node 22 via nvm if missing or too old (requires v20+)
2. **Clones the repo** — to `~/.sl-grocery-capture/`
3. **Installs dependencies** — `npm install` (includes Puppeteer + stealth plugin)
4. **Captures Keells prices** — launches headless browser, bypasses Cloudflare, fetches 80 meat products
5. **Pushes to Worker** — POSTs snapshot to `https://price-compare-cloudflare.buddhima.workers.dev/api/snapshots`
6. **Sets up cron** — daily at 2:00 AM UTC (7:30 AM IST), 30 min before the Worker cron runs Glomark + Cargills

### Subsequent Runs

- Pulls latest code from git
- Captures fresh prices
- Pushes to Worker
- Skips cron setup (already configured)

## Transferring to a New Machine

```bash
# Option 1: SCP
scp scripts/keells-standalone.sh user@new-machine:~/keells-standalone.sh

# Option 2: Copy-paste the file contents

# Then on the new machine:
bash ~/keells-standalone.sh
```

## Configuration

These values are hardcoded in the script (edit before transferring):

| Variable | Value | Description |
|---|---|---|
| `WORKER_URL` | `https://price-compare-cloudflare.buddhima.workers.dev` | Deployed Worker URL |
| `SNAPSHOT_API_KEY` | (secret) | Bearer token for POST /api/snapshots |
| `CRON_SCHEDULE` | `0 2 * * *` | 2:00 AM UTC = 7:30 AM IST |
| `INSTALL_DIR` | `~/.sl-grocery-capture` | Where the repo is cloned |
| `LOG_FILE` | `~/.sl-grocery-capture/capture.log` | Cron output log |

## Managing Cron

```bash
# View current cron
crontab -l

# Remove the Keells cron
crontab -l | grep -v 'sl-grocery-keells-capture' | crontab -

# Run manually (skip cron setup)
bash ~/keells-standalone.sh --no-cron
```

## Monitoring

```bash
# Check last capture log
tail -50 ~/.sl-grocery-capture/capture.log

# Check data freshness on the API
curl -s https://price-compare-cloudflare.buddhima.workers.dev/api/health | python3 -m json.tool
```

## Requirements

- macOS or Linux
- Git (with SSH access to the repo)
- Internet connection
- ~500MB disk (Node.js + Chromium for Puppeteer)
- No root/sudo needed

## Troubleshooting

| Issue | Fix |
|---|---|
| `git clone` fails | Ensure SSH key is set up for GitHub on this machine |
| Puppeteer fails to launch | May need `--no-sandbox` flag or Chrome system deps on Linux |
| Push returns 401 | Check `SNAPSHOT_API_KEY` matches the Worker secret |
| Cron not running | Check `crontab -l`, verify PATH includes node |
| Node not found in cron | The script sources nvm automatically |
