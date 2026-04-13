#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Secure Job Portal — Watchdog Script
# Secondary defense layer: polls services and auto-recovers if unhealthy
#
# Usage:
#   chmod +x watchdog.sh
#   ./watchdog.sh                          # Run in foreground
#   nohup ./watchdog.sh > /var/log/sjp-watchdog.log 2>&1 &   # Daemonize
#   # Or use systemd (recommended, see sjp-watchdog.service)
#
# What it does:
#   1. Polls the backend /api/health endpoint every POLL_INTERVAL seconds
#   2. Polls the frontend (Nginx) root page
#   3. If a service fails MAX_FAILURES consecutive checks, it restarts
#      the failing container first; if that doesn't fix it, it restarts
#      the entire stack as a last resort.
#   4. Logs all events with timestamps for audit trail
# ─────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────
COMPOSE_DIR="/home/iiitd/Secure-Job-Portal"
COMPOSE_FILE="${COMPOSE_DIR}/docker-compose.yml"
LOG_FILE="/var/log/sjp-watchdog.log"

BACKEND_URL="http://localhost:8000/api/health"
FRONTEND_URL="http://localhost:80"

POLL_INTERVAL=30          # seconds between health checks
MAX_FAILURES=3            # consecutive failures before restart
FULL_RESTART_COOLDOWN=300 # seconds between full stack restarts (5 min)
REQUEST_TIMEOUT=10        # seconds to wait for HTTP response

# ── State tracking ───────────────────────────────────────────────────────
backend_failures=0
frontend_failures=0
last_full_restart=0

# ── Logging ──────────────────────────────────────────────────────────────
log() {
    local level="$1"
    shift
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] $*" | tee -a "${LOG_FILE}"
}

log_info()    { log "INFO"    "$@"; }
log_warn()    { log "WARN"    "$@"; }
log_error()   { log "ERROR"   "$@"; }
log_success() { log "OK"      "$@"; }

# ── Health check functions ───────────────────────────────────────────────
check_backend() {
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time "${REQUEST_TIMEOUT}" \
        --insecure \
        "${BACKEND_URL}" 2>/dev/null) || http_code="000"

    if [[ "${http_code}" == "200" ]]; then
        return 0
    else
        return 1
    fi
}

check_frontend() {
    local http_code
    # Try HTTP first, then HTTPS
    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
        --max-time "${REQUEST_TIMEOUT}" \
        --insecure \
        "${FRONTEND_URL}" 2>/dev/null) || http_code="000"

    # 200, 301 (redirect to HTTPS), or 308 are all valid
    if [[ "${http_code}" =~ ^(200|301|302|308)$ ]]; then
        return 0
    else
        return 1
    fi
}

check_container_running() {
    local container_name="$1"
    local status
    status=$(docker inspect -f '{{.State.Status}}' "${container_name}" 2>/dev/null) || status="not_found"
    [[ "${status}" == "running" ]]
}

# ── Recovery actions ─────────────────────────────────────────────────────
restart_container() {
    local service="$1"
    log_warn "Restarting container: ${service}"
    docker compose -f "${COMPOSE_FILE}" restart "${service}" 2>&1 | tee -a "${LOG_FILE}"
    sleep 15  # Give the container time to come back up
}

full_stack_restart() {
    local now
    now=$(date +%s)
    local elapsed=$(( now - last_full_restart ))

    if (( elapsed < FULL_RESTART_COOLDOWN )); then
        log_warn "Full restart cooldown active (${elapsed}s / ${FULL_RESTART_COOLDOWN}s). Skipping."
        return
    fi

    log_error "╔══════════════════════════════════════════════════════════════╗"
    log_error "║  FULL STACK RESTART — Multiple services unresponsive       ║"
    log_error "╚══════════════════════════════════════════════════════════════╝"

    docker compose -f "${COMPOSE_FILE}" down 2>&1 | tee -a "${LOG_FILE}"
    sleep 5
    docker compose -f "${COMPOSE_FILE}" up --build -d 2>&1 | tee -a "${LOG_FILE}"

    last_full_restart=$(date +%s)
    backend_failures=0
    frontend_failures=0

    # Wait for services to stabilize
    sleep 30
    log_info "Full stack restart completed. Resuming monitoring."
}

# ── Docker status summary ───────────────────────────────────────────────
print_status() {
    log_info "─── Container Status ───"
    docker compose -f "${COMPOSE_FILE}" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>&1 | tee -a "${LOG_FILE}"
    log_info "────────────────────────"
}

# ── Trap signals for graceful shutdown ───────────────────────────────────
cleanup() {
    log_info "Watchdog shutting down (received signal)."
    exit 0
}
trap cleanup SIGTERM SIGINT SIGHUP

# ── Pre-flight checks ───────────────────────────────────────────────────
preflight() {
    if ! command -v docker &>/dev/null; then
        log_error "Docker is not installed or not in PATH. Exiting."
        exit 1
    fi

    if ! docker compose version &>/dev/null; then
        log_error "Docker Compose V2 is not available. Exiting."
        exit 1
    fi

    if [[ ! -f "${COMPOSE_FILE}" ]]; then
        log_error "Compose file not found: ${COMPOSE_FILE}. Exiting."
        exit 1
    fi

    # Ensure log directory exists
    mkdir -p "$(dirname "${LOG_FILE}")" 2>/dev/null || true
    touch "${LOG_FILE}" 2>/dev/null || {
        LOG_FILE="${COMPOSE_DIR}/watchdog.log"
        log_warn "Cannot write to /var/log, using ${LOG_FILE} instead."
    }
}

# ═════════════════════════════════════════════════════════════════════════
# MAIN LOOP
# ═════════════════════════════════════════════════════════════════════════
main() {
    preflight

    log_info "╔══════════════════════════════════════════════════════════════╗"
    log_info "║  Secure Job Portal — Watchdog Started                      ║"
    log_info "║  Polling interval: ${POLL_INTERVAL}s | Max failures: ${MAX_FAILURES}            ║"
    log_info "║  Backend URL:  ${BACKEND_URL}"
    log_info "║  Frontend URL: ${FRONTEND_URL}"
    log_info "╚══════════════════════════════════════════════════════════════╝"

    print_status

    while true; do
        # ── Check Backend ────────────────────────────────────────────
        if check_backend; then
            if (( backend_failures > 0 )); then
                log_success "Backend recovered after ${backend_failures} failure(s)."
            fi
            backend_failures=0
        else
            (( backend_failures++ )) || true
            log_warn "Backend health check FAILED (${backend_failures}/${MAX_FAILURES})"

            if (( backend_failures >= MAX_FAILURES )); then
                if check_container_running "sjp-backend"; then
                    log_error "Backend container running but not responding — possible freeze/exploit."
                    restart_container "backend"
                else
                    log_error "Backend container is DOWN."
                    restart_container "backend"
                fi

                # Check if restart fixed it
                sleep 5
                if check_backend; then
                    log_success "Backend recovered after container restart."
                    backend_failures=0
                else
                    log_error "Backend still unhealthy after restart. Will trigger full restart if frontend also fails."
                fi
            fi
        fi

        # ── Check Frontend ───────────────────────────────────────────
        if check_frontend; then
            if (( frontend_failures > 0 )); then
                log_success "Frontend recovered after ${frontend_failures} failure(s)."
            fi
            frontend_failures=0
        else
            (( frontend_failures++ )) || true
            log_warn "Frontend health check FAILED (${frontend_failures}/${MAX_FAILURES})"

            if (( frontend_failures >= MAX_FAILURES )); then
                if check_container_running "sjp-frontend"; then
                    log_error "Frontend container running but not responding — possible freeze/exploit."
                    restart_container "frontend"
                else
                    log_error "Frontend container is DOWN."
                    restart_container "frontend"
                fi

                # Check if restart fixed it
                sleep 5
                if check_frontend; then
                    log_success "Frontend recovered after container restart."
                    frontend_failures=0
                else
                    log_error "Frontend still unhealthy after restart."
                fi
            fi
        fi

        # ── Full stack restart if both are broken ────────────────────
        if (( backend_failures >= MAX_FAILURES && frontend_failures >= MAX_FAILURES )); then
            full_stack_restart
        fi

        # ── Periodic status (every 10 cycles) ───────────────────────
        if (( RANDOM % 10 == 0 )); then
            print_status
        fi

        sleep "${POLL_INTERVAL}"
    done
}

main "$@"
