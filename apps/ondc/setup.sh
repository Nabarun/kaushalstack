#!/usr/bin/env bash
# If invoked via `sh setup.sh`, re-exec under bash before any bash-only syntax runs.
if [ -z "${BASH_VERSION:-}" ]; then exec bash "$0" "$@"; fi
#
# setup.sh — one-shot setup for KaushalStack Lead Scout (MCP × Beckn/ONDC)
#
# What it does:
#   1. Verifies Python 3.10+
#   2. Creates a virtualenv (.venv) and installs requirements
#   3. Copies .env.example -> .env if missing
#   4. Runs the test suite (20 tests)
#   5. Registers the MCP server with Claude Code if the `claude` CLI is present,
#      otherwise prints the Claude Desktop config block to paste manually
#
# Usage:
#   ./setup.sh                 # full setup, local (personal) MCP scope
#   ./setup.sh --scope project # share config with team via .mcp.json
#   ./setup.sh --no-venv       # install into current environment, skip venv
#   ./setup.sh --skip-tests    # faster re-run
#
set -euo pipefail

# ---- locate project root (dir this script lives in) -------------------------
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

SCOPE="local"
USE_VENV=1
RUN_TESTS=1
SERVER_NAME="lead-scout"

while [ $# -gt 0 ]; do
  case "$1" in
    --scope) SCOPE="${2:-local}"; shift 2;;
    --scope=*) SCOPE="${1#*=}"; shift;;
    --no-venv) USE_VENV=0; shift;;
    --skip-tests) RUN_TESTS=0; shift;;
    -h|--help) sed -n '5,/^set -euo/{/^set -euo/d;s/^# \{0,1\}//;s/^#//;p;}' "$0"; exit 0;;
    *) echo "Unknown option: $1 (use --help)" >&2; exit 1;;
  esac
done

# ---- colors -----------------------------------------------------------------
if [ -t 1 ]; then G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; B=$'\033[1m'; N=$'\033[0m'
else G=""; Y=""; R=""; B=""; N=""; fi
say()  { printf "%s\n" "${B}==>${N} $*"; }
ok()   { printf "%s\n" "  ${G}[ok]${N} $*"; }
warn() { printf "%s\n" "  ${Y}[!]${N} $*"; }
die()  { printf "%s\n" "  ${R}[x]${N} $*" >&2; exit 1; }

# ---- Claude Desktop config printer (used if `claude` CLI is absent) ---------
print_desktop_config() {
  local cfg
  case "$(uname -s)" in
    Darwin) cfg="~/Library/Application Support/Claude/claude_desktop_config.json";;
    Linux)  cfg="~/.config/Claude/claude_desktop_config.json";;
    *)      cfg="%APPDATA%\\Claude\\claude_desktop_config.json";;
  esac
  echo
  say "Add this to your Claude Desktop config:"
  echo "  $cfg"
  cat <<EOF

  {
    "mcpServers": {
      "${SERVER_NAME}": {
        "command": "${PY_ABS}",
        "args": ["-m", "src.mcp_server"],
        "cwd": "${PROJECT_DIR}"
      }
    }
  }

  Then fully quit Claude Desktop (Cmd+Q / tray > Quit) and reopen it.
  Look for the tools icon at the bottom of a new chat.
EOF
}

# ---- 1. Python check --------------------------------------------------------
say "Checking Python"
PY=""
for cand in python3 python; do
  if command -v "$cand" >/dev/null 2>&1; then
    ver="$("$cand" -c 'import sys;print("%d.%d"%sys.version_info[:2])' 2>/dev/null || echo 0.0)"
    major="${ver%%.*}"; minor="${ver#*.}"
    if [ "$major" -eq 3 ] && [ "$minor" -ge 10 ]; then PY="$cand"; break; fi
  fi
done
[ -n "$PY" ] || die "Python 3.10+ required. Found: $(python3 --version 2>&1 || echo none)"
ok "Using $($PY --version 2>&1) ($(command -v "$PY"))"

# ---- 2. venv + deps ---------------------------------------------------------
if [ "$USE_VENV" -eq 1 ]; then
  say "Creating virtualenv (.venv)"
  [ -d .venv ] || "$PY" -m venv .venv
  # shellcheck disable=SC1091
  source .venv/bin/activate
  PY="python"
  ok "venv active: $(command -v python)"
else
  warn "Skipping venv — installing into current environment"
fi

say "Installing dependencies"
"$PY" -m pip install --quiet --upgrade pip >/dev/null 2>&1 || true
PIP_FLAGS=""
if [ "$USE_VENV" -eq 0 ]; then
  # Outside a venv, Debian/Ubuntu (PEP 668) refuses installs without this.
  if "$PY" -m pip install --quiet -r requirements.txt 2>/dev/null; then
    ok "Dependencies installed"
  elif "$PY" -m pip install --quiet --break-system-packages -r requirements.txt; then
    ok "Dependencies installed (--break-system-packages)"
  else
    die "pip install failed. If offline, connect to a network and retry; or drop --no-venv."
  fi
else
  if "$PY" -m pip install --quiet -r requirements.txt; then
    ok "Dependencies installed"
  else
    die "pip install failed. If offline, connect to a network and retry."
  fi
fi

# ---- 3. .env ----------------------------------------------------------------
say "Environment file"
if [ -f .env ]; then
  ok ".env already exists (left untouched)"
else
  cp .env.example .env
  ok ".env created from template — edit BUSINESS_GPS / BUSINESS_KEYWORDS for your client"
  warn "ONDC_MOCK=true by default: tools work now, no registration needed"
fi

# ---- 4. tests ---------------------------------------------------------------
if [ "$RUN_TESTS" -eq 1 ]; then
  say "Running test suite"
  if "$PY" tests/run_tests.py; then
    ok "All tests passed"
  else
    die "Tests failed — fix before registering the server"
  fi
else
  warn "Skipping tests (--skip-tests)"
fi

# ---- 5. register MCP server -------------------------------------------------
# Absolute interpreter path so Claude spawns the right Python (venv-aware).
PY_ABS="$(command -v "$PY")"
[ "$USE_VENV" -eq 1 ] && PY_ABS="$PROJECT_DIR/.venv/bin/python"

say "Registering MCP server '${SERVER_NAME}'"
if command -v claude >/dev/null 2>&1; then
  # Remove any prior registration so re-runs are idempotent.
  claude mcp remove "$SERVER_NAME" >/dev/null 2>&1 || true
  if claude mcp add --scope "$SCOPE" "$SERVER_NAME" \
        -- "$PY_ABS" -m src.mcp_server; then
    ok "Registered with Claude Code (scope: $SCOPE)"
    echo
    say "Next steps"
    cat <<EOF
  1. cd "$PROJECT_DIR" && claude          # start Claude Code here
  2. /mcp                                  # confirm '${SERVER_NAME}' is connected (5 tools)
  3. Try:  "Show me my leads sorted by score"

  To seed demo leads, in another terminal:
    cd "$PROJECT_DIR" && source .venv/bin/activate
    uvicorn src.webhook.app:app --port 8080 &
    curl -X POST localhost:8080/search -H 'Content-Type: application/json' \\
         --data-binary @mock/sample_search_intent.json
EOF
  else
    warn "claude mcp add failed — use the manual config below"
    print_desktop_config
  fi
else
  warn "'claude' CLI not found — printing Claude Desktop config instead"
  print_desktop_config
fi

exit 0
