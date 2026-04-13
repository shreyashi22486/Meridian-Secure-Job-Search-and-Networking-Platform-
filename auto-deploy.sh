#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Secure Job Portal — Pull-Based Auto-Deploy
# Runs via cron on the server. Checks for new commits on main and
# automatically rebuilds + restarts containers when changes are detected.
#
# Setup:
#   chmod +x auto-deploy.sh
#   crontab -e
#   */2 * * * * /home/iiitd/Secure-Job-Portal/auto-deploy.sh >> /var/log/sjp-autodeploy.log 2>&1
#
# How it works:
#   1. Fetches latest commits from origin/main
#   2. Compares local HEAD with remote HEAD
#   3. If different → pulls changes, rebuilds containers, verifies health
#   4. If same → exits silently (no spam in logs)
# ─────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_DIR="/home/iiitd/Secure-Job-Portal"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.yml"
LOCK_FILE="/tmp/sjp-autodeploy.lock"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')] [AUTO-DEPLOY]"

# ── Prevent concurrent runs ─────────────────────────────────────────────
if [ -f "${LOCK_FILE}" ]; then
    # Check if the lock is stale (older than 10 minutes)
    lock_age=$(( $(date +%s) - $(stat -c %Y "${LOCK_FILE}" 2>/dev/null || echo 0) ))
    if (( lock_age < 600 )); then
        exit 0  # Another deploy is running, skip silently
    fi
    echo "${LOG_PREFIX} Removing stale lock file (${lock_age}s old)"
    rm -f "${LOCK_FILE}"
fi

trap 'rm -f "${LOCK_FILE}"' EXIT
touch "${LOCK_FILE}"

# ── Fetch and compare ───────────────────────────────────────────────────
cd "${PROJECT_DIR}"

# Fetch without merging
git fetch origin main --quiet 2>/dev/null || {
    echo "${LOG_PREFIX} ERROR: git fetch failed (no network?)"
    exit 1
}

LOCAL_HEAD=$(git rev-parse HEAD)
REMOTE_HEAD=$(git rev-parse origin/main)

# No changes? Exit silently.
if [ "${LOCAL_HEAD}" == "${REMOTE_HEAD}" ]; then
    exit 0
fi

# ── New commits detected — deploy! ──────────────────────────────────────
echo "${LOG_PREFIX} ════════════════════════════════════════════════════════"
echo "${LOG_PREFIX} New commits detected!"
echo "${LOG_PREFIX}   Local:  ${LOCAL_HEAD:0:8}"
echo "${LOG_PREFIX}   Remote: ${REMOTE_HEAD:0:8}"
echo "${LOG_PREFIX} ════════════════════════════════════════════════════════"

# Show what's new
echo "${LOG_PREFIX} Changes:"
git log --oneline "${LOCAL_HEAD}..${REMOTE_HEAD}" | while read -r line; do
    echo "${LOG_PREFIX}   ${line}"
done

# Pull latest code
echo "${LOG_PREFIX} Pulling latest code..."
git pull origin main --quiet

# Rebuild and restart containers
echo "${LOG_PREFIX} Rebuilding containers..."
docker compose -f "${COMPOSE_FILE}" up --build -d 2>&1 | while read -r line; do
    echo "${LOG_PREFIX}   ${line}"
done

# Wait for services to stabilize
echo "${LOG_PREFIX} Waiting for services to become healthy (30s)..."
sleep 30

# ── Verify health ───────────────────────────────────────────────────────
BACKEND_OK=false
FRONTEND_OK=false

backend_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 http://localhost:8000/api/health 2>/dev/null) || backend_status="000"
if [ "${backend_status}" == "200" ]; then
    BACKEND_OK=true
    echo "${LOG_PREFIX} ✅ Backend healthy (HTTP 200)"
else
    echo "${LOG_PREFIX} ⚠️  Backend returned HTTP ${backend_status}"
fi

frontend_status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 --insecure http://localhost:80/ 2>/dev/null) || frontend_status="000"
if [[ "${frontend_status}" =~ ^(200|301|302|308)$ ]]; then
    FRONTEND_OK=true
    echo "${LOG_PREFIX} ✅ Frontend healthy (HTTP ${frontend_status})"
else
    echo "${LOG_PREFIX} ⚠️  Frontend returned HTTP ${frontend_status}"
fi

# ── Report ──────────────────────────────────────────────────────────────
echo "${LOG_PREFIX} Container status:"
docker compose -f "${COMPOSE_FILE}" ps 2>&1 | while read -r line; do
    echo "${LOG_PREFIX}   ${line}"
done

if $BACKEND_OK && $FRONTEND_OK; then
    echo "${LOG_PREFIX} 🎉 Auto-deploy complete! (${LOCAL_HEAD:0:8} → ${REMOTE_HEAD:0:8})"
else
    echo "${LOG_PREFIX} ⚠️  Deploy finished but some services may not be ready yet."
    echo "${LOG_PREFIX}     The watchdog will handle recovery if needed."
fi

echo "${LOG_PREFIX} ════════════════════════════════════════════════════════"
