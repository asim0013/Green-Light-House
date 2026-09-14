#!/usr/bin/env bash
# dev-guard — assert the environment before a GLH dev/test run, and fold the
# steps that were forgotten repeatedly into commands that cannot forget them.
#
# Every trap encoded here drew blood during Epic 3 development:
#   - the shell cwd drifting to C:\AL\Logisupp and running against the WRONG repo
#     (3x — once `preview_start` launched LogiSupp's dev server and every GLH
#     route 404'd; once a `git diff` reported an empty diff for a just-edited file)
#   - Docker's `com.docker.service` STOPPED with WIN32_EXIT_CODE 1077 after a boot
#   - `glh-app-1` binding port 3000 and colliding with Playwright
#   - a source mutation invisible in the browser because the Redis read cache was
#     never flushed after a seed
#
# Usage:
#   bash scripts/dev-guard.sh check     # assert cwd, repo, docker, port — exit 1 on any problem
#   bash scripts/dev-guard.sh e2e       # check + free port 3000 (stop glh-app-1)
#   bash scripts/dev-guard.sh seed      # db:seed AND cache:flush, in that order, always both
set -uo pipefail

fail() { echo "  ✗ $1" >&2; PROBLEMS=$((PROBLEMS + 1)); }
ok()   { echo "  ✓ $1"; }

check_repo() {
  local root
  root="$(git rev-parse --show-toplevel 2>/dev/null)"
  case "$root" in
    */GLH) ok "repo: $root" ;;
    "")    fail "not in a git repo (cwd: $(pwd))" ;;
    *)     fail "WRONG REPO: $root — expected …/GLH. cd /c/AL/GLH first." ;;
  esac
}

check_docker() {
  if docker info >/dev/null 2>&1; then
    ok "docker daemon reachable"
    local unhealthy
    unhealthy="$(docker ps --filter 'health=unhealthy' --format '{{.Names}}' 2>/dev/null)"
    [ -n "$unhealthy" ] && fail "unhealthy containers: $unhealthy"
    for c in glh-postgres-1 glh-redis-1; do
      docker ps --format '{{.Names}}' | grep -q "^$c$" || fail "$c not running (try: docker compose up -d)"
    done
  else
    fail "docker daemon unreachable. If com.docker.service is STOPPED (1077), start it ELEVATED then launch Docker Desktop — a non-elevated Start-Service fails before registering an attempt."
  fi
}

# `netstat` is the portable check on this Windows/Git-Bash box.
port3000_pid() { netstat -ano 2>/dev/null | grep -E ':3000\s+.*LISTENING' | head -1 | awk '{print $NF}'; }

cmd_check() {
  PROBLEMS=0
  echo "dev-guard: checking environment"
  check_repo
  check_docker
  local pid; pid="$(port3000_pid)"
  if [ -n "$pid" ]; then
    if docker ps --format '{{.Names}}' | grep -q '^glh-app-1$'; then
      echo "  ⚠ port 3000 held by glh-app-1 (pid $pid) — run 'dev-guard e2e' to free it for Playwright"
    else
      echo "  ⚠ port 3000 in use by pid $pid"
    fi
  else
    ok "port 3000 free"
  fi
  if [ "${PROBLEMS:-0}" -gt 0 ]; then echo "dev-guard: $PROBLEMS problem(s)"; return 1; fi
  echo "dev-guard: ok"
}

cmd_e2e() {
  cmd_check || true
  if docker ps --format '{{.Names}}' | grep -q '^glh-app-1$'; then
    echo "dev-guard: stopping glh-app-1 to free port 3000 for Playwright"
    docker stop glh-app-1 >/dev/null && ok "glh-app-1 stopped"
  fi
  local pid; pid="$(port3000_pid)"
  [ -n "$pid" ] && echo "  ⚠ port 3000 STILL held by pid $pid — not glh-app-1; investigate before running e2e"
}

# The seed step whose second half was forgotten repeatedly: a stale Redis read
# cache made a fresh seed invisible in the browser and once nearly recorded a
# false P5 pass. This runs both, always, in order.
cmd_seed() {
  check_repo || { echo "dev-guard: refusing to seed — wrong repo"; return 1; }
  echo "dev-guard: db:seed"
  npm run db:seed || { echo "dev-guard: seed failed — NOT flushing cache"; return 1; }
  echo "dev-guard: cache:flush (never skip this after a seed)"
  npm run cache:flush
}

case "${1:-check}" in
  check) cmd_check ;;
  e2e)   cmd_e2e ;;
  seed)  cmd_seed ;;
  *) echo "usage: dev-guard.sh [check|e2e|seed]" >&2; exit 2 ;;
esac
