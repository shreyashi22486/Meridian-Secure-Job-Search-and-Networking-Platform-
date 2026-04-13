#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Secure Job Portal — One-Shot Deployment Script
# Builds, starts containers, and installs the watchdog as a systemd service
#
# Usage:  sudo ./deploy.sh
# ─────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

banner() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║        Secure Job Portal — Docker Deployment               ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

info()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*"; }
section() { echo -e "\n${BOLD}${CYAN}── $* ──${NC}"; }

# ── Pre-flight checks ───────────────────────────────────────────────────
preflight() {
    section "Pre-flight Checks"

    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root (sudo ./deploy.sh)"
        exit 1
    fi

    if ! command -v docker &>/dev/null; then
        error "Docker is not installed. Install it first:"
        echo "  curl -fsSL https://get.docker.com | sh"
        exit 1
    fi
    info "Docker found: $(docker --version)"

    if ! docker compose version &>/dev/null; then
        error "Docker Compose V2 is not available."
        exit 1
    fi
    info "Docker Compose found: $(docker compose version --short)"

    if [[ ! -f "${SCRIPT_DIR}/.env" ]]; then
        warn ".env file not found. Using defaults from docker-compose.yml"
        warn "For production, copy .env.example to .env and set real secrets!"
    else
        info ".env file found"
    fi
}

# ── Stop old nohup processes ────────────────────────────────────────────
stop_legacy() {
    section "Stopping Legacy Processes"

    if pgrep -f "uvicorn.*app.main:app" >/dev/null 2>&1; then
        warn "Found running uvicorn (nohup). Stopping..."
        pkill -f "uvicorn.*app.main:app" 2>/dev/null || true
        info "Uvicorn stopped"
    else
        info "No legacy uvicorn process found"
    fi

    if pgrep -f "vite.*5173" >/dev/null 2>&1; then
        warn "Found running vite dev server (nohup). Stopping..."
        pkill -f "vite.*5173" 2>/dev/null || true
        info "Vite stopped"
    else
        info "No legacy vite process found"
    fi

    sleep 2
}

# ── Build and start containers ──────────────────────────────────────────
start_containers() {
    section "Building & Starting Containers"

    cd "${SCRIPT_DIR}"

    info "Pulling base images..."
    docker compose -f "${COMPOSE_FILE}" pull postgres 2>/dev/null || true

    info "Building application images..."
    docker compose -f "${COMPOSE_FILE}" build --no-cache

    info "Starting services..."
    docker compose -f "${COMPOSE_FILE}" up -d

    echo ""
    info "Waiting for services to become healthy..."
    local retries=0
    local max_retries=30
    while (( retries < max_retries )); do
        local healthy
        healthy=$(docker compose -f "${COMPOSE_FILE}" ps --format json 2>/dev/null | grep -c '"healthy"' || echo "0")
        local total
        total=$(docker compose -f "${COMPOSE_FILE}" ps --format json 2>/dev/null | wc -l || echo "0")

        echo -ne "\r  Healthy: ${healthy}/${total} containers (attempt ${retries}/${max_retries})..."

        if (( healthy >= 3 )); then
            echo ""
            info "All containers are healthy!"
            break
        fi

        (( retries++ ))
        sleep 5
    done

    if (( retries >= max_retries )); then
        warn "Some containers may not be fully healthy yet. Check with: docker compose ps"
    fi

    echo ""
    docker compose -f "${COMPOSE_FILE}" ps
}

# ── Install watchdog as systemd service ─────────────────────────────────
install_watchdog() {
    section "Installing Watchdog Service"

    chmod +x "${SCRIPT_DIR}/watchdog.sh"
    info "Made watchdog.sh executable"

    cp "${SCRIPT_DIR}/sjp-watchdog.service" /etc/systemd/system/sjp-watchdog.service
    info "Copied systemd unit file"

    systemctl daemon-reload
    systemctl enable sjp-watchdog.service
    systemctl start sjp-watchdog.service
    info "Watchdog service enabled and started"

    local status
    status=$(systemctl is-active sjp-watchdog.service 2>/dev/null || echo "unknown")
    if [[ "${status}" == "active" ]]; then
        info "Watchdog is running ✓"
    else
        warn "Watchdog status: ${status}. Check: journalctl -u sjp-watchdog -f"
    fi
}

# ── Print summary ───────────────────────────────────────────────────────
print_summary() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}  ${GREEN}${BOLD}Deployment Complete!${NC}                                      ${CYAN}║${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║${NC}                                                              ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${BOLD}Services:${NC}                                                  ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    Backend API:   http://localhost:8000/api/health            ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    Frontend:      http://localhost:80                         ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    PostgreSQL:    localhost:5432 (internal only)              ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                              ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${BOLD}Useful Commands:${NC}                                             ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    docker compose ps              # Check status             ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    docker compose logs -f          # Follow logs              ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    docker compose restart backend  # Restart backend          ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    docker compose down             # Stop everything          ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                              ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  ${BOLD}Watchdog:${NC}                                                  ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    systemctl status sjp-watchdog   # Watchdog status          ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    journalctl -u sjp-watchdog -f   # Watchdog logs            ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    tail -f /var/log/sjp-watchdog.log  # Direct log            ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                              ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# ── Main ─────────────────────────────────────────────────────────────────
main() {
    banner
    preflight
    stop_legacy
    start_containers
    install_watchdog
    print_summary
}

main "$@"
