#!/usr/bin/env bash
# End-to-end test of a 7ots desktop INSTALLER, the way a user gets it: install, first run, pet up, quit, uninstall.
# Used by .github/workflows/desktop-release.yml (job installer-e2e), one run per installer:
#
#   installer-e2e.sh deb      <dir>   sudo apt install ./7ots-linux.deb → `7ots` … → sudo apt remove 7ots
#   installer-e2e.sh appimage <dir>   chmod +x 7ots-linux.AppImage → ./7ots-linux.AppImage --no-sandbox
#   installer-e2e.sh mac      <dir>   hdiutil attach 7ots-mac.dmg → cp 7ots.app /Applications → open
#   installer-e2e.sh win      <dir>   7ots-windows.exe /S → %LOCALAPPDATA%\Programs\7ots\7ots.exe → uninstaller /S
#
# <dir> holds the installers (build artifacts or the pet-releases download). Linux needs a display (xvfb-run).
# Asserts: the first run creates identity.json in SEVENOTS_HOME (a fresh temp dir), the daemon answers
# GET /health on 127.0.0.1:$SEVENOTS_PET_PORT (default 7717, the URL launcher.cjs health() polls), a pet window
# (X window / renderer process) is still up ~20 s later, and POST /quit stops the daemon and the window. Screenshots,
# pet.log and the app's stdout go to $E2E_OUT/<mode>/ (default ./e2e-out). On failure pet.log is printed.
#
# Local dry run (no apt): E2E_DEB_EXTRACT=1 extracts the .deb with dpkg-deb -x instead of installing it.
set -euo pipefail

MODE=${1:?usage: installer-e2e.sh deb|appimage|mac|win <dir>}
DIR=$(cd "${2:?installer dir}" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${E2E_OUT:-$PWD/e2e-out}/$MODE
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
PORT=${SEVENOTS_PET_PORT:-7717}
URL="http://127.0.0.1:$PORT"
SETTLE=${E2E_SETTLE:-20}
win=false
[ "$MODE" = win ] && win=true

# Isolated state: a fresh ~/.7ots, no auto-update.
TMPBASE=${E2E_TMP:-${RUNNER_TEMP:-/tmp}} # not TMPDIR: a long one breaks the single-instance socket (108-char limit)
$win && TMPBASE=$(cygpath -u "$TMPBASE")
SHOME=$(mktemp -d "$TMPBASE/7ots-home-$MODE.XXXXXX")
if $win; then
  export MSYS2_ARG_CONV_EXCL='*' # keep /S, /F … as they are; every path below is passed in Windows form
  export SEVENOTS_HOME=$(cygpath -w "$SHOME")
else
  export SEVENOTS_HOME=$SHOME
fi
export SEVENOTS_NO_UPDATE=1 SEVENOTS_PET_PORT=$PORT

log() { printf '\n== [%s %s] %s\n' "$MODE" "$(date +%H:%M:%S)" "$*"; }
fail() {
  echo "::error::[$MODE] $*"
  exit 1
}

# wait_for <seconds> <what> <command…>: polls once a second.
wait_for() {
  local secs=$1 what=$2
  shift 2
  for ((i = 0; i < secs; i++)); do
    if "$@"; then
      log "$what (after ${i}s)"
      return 0
    fi
    sleep 1
  done
  fail "timed out after ${secs}s waiting for: $what"
}

# "<pid> <command line>" of every process of the installed app.
procs() {
  if $win; then
    powershell -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$HERE/win.ps1")" procs | tr -d '\r'
  else
    ps -Ao pid=,command= | grep -E "$MATCH" | grep -vE 'grep|installer-e2e' || true
  fi
}
# The pet window. Linux: the X window titled "<name> · 7ots", class 7ots (zygote-forked renderers keep the zygote's
# command line, so the process list can't tell). macOS/Windows: a renderer helper of the installed app.
window_up() {
  case "$MODE" in
    deb | appimage) xwininfo -root -tree | grep -q ' · 7ots": ("7ots" "7ots")' ;;
    *) procs | grep -q -- '--type=renderer' ;;
  esac
}
# main processes: the shell (and on an AppImage the daemon too), not Chromium helpers nor the node-mode daemon
main_up() { procs | grep -v -- '--type=' | grep -vq '7ots.mjs'; }
none_left() { [ -z "$(procs)" ]; }
health() { curl -fsS --max-time 3 "$URL/health" 2>/dev/null; }
health_ok() { health | grep -q '"ok":true'; }
health_down() { ! health >/dev/null; }
identity() { [ -s "$SHOME/identity.json" ]; }

screenshot() {
  local f="$OUT/$1.png"
  case "$MODE" in
    deb | appimage) import -window root "$f" ;;
    mac) screencapture -x "$f" ;;
    win) powershell -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$HERE/win.ps1")" shot "$(cygpath -w "$f")" ;;
  esac && log "screenshot $f" || echo "::warning::[$MODE] screenshot $1 failed"
}

kill_left() {
  if $win; then
    taskkill /F /T /IM 7ots.exe >/dev/null 2>&1 || true
  else
    for p in $(procs | awk '{print $1}'); do kill -9 "$p" 2>/dev/null || true; done
  fi
}

finish() {
  local rc=$?
  set +e
  cp "$SHOME/pet.log" "$OUT/pet.log" 2>/dev/null
  if [ "$rc" != 0 ]; then
    screenshot failure
    echo "---- processes ----"
    procs
    echo "---- $SEVENOTS_HOME ----"
    ls -la "$SHOME"
    echo "---- pet.log ----"
    cat "$SHOME/pet.log" 2>/dev/null || echo "(no pet.log)"
    echo "---- app stdout/stderr ----"
    tail -n 200 "$OUT/app.log" 2>/dev/null
  fi
  kill_left
  [ -n "${MNT:-}" ] && hdiutil detach "$MNT" -force >/dev/null 2>&1
  log "exit $rc"
  exit "$rc"
}
trap finish EXIT

# ---- install ----------------------------------------------------------------------------------------------------
EXE=()
case "$MODE" in
  deb)
    PKG="$DIR/7ots-linux.deb"
    [ -f "$PKG" ] || fail "missing $PKG"
    if [ "${E2E_DEB_EXTRACT:-}" = 1 ]; then
      ROOTFS=$(mktemp -d "$TMPBASE/7ots-deb.XXXXXX")
      log "extract $PKG → $ROOTFS (E2E_DEB_EXTRACT)"
      dpkg-deb -x "$PKG" "$ROOTFS"
      APPDIR="$ROOTFS/opt/7ots"
      EXE=("$APPDIR/7ots")
    else
      log "sudo apt install $PKG"
      sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "$PKG"
      APPDIR=/opt/7ots
      [ -x /opt/7ots/7ots ] || fail "/opt/7ots/7ots not installed"
      command -v 7ots >/dev/null || fail "7ots is not on PATH after install"
      ls -l /opt/7ots/chrome-sandbox
      EXE=(7ots) # what the .desktop entry / a terminal runs
    fi
    MATCH="^ *[0-9]+ ($APPDIR/|7ots( |\$))" # `7ots` from PATH, then /opt/7ots/7ots (relaunch, helpers)
    ;;
  appimage)
    IMG="$DIR/7ots-linux.AppImage"
    [ -f "$IMG" ] || fail "missing $IMG"
    chmod +x "$IMG"
    EXE=("$IMG" --no-sandbox)
    MATCH='/\.mount_7ots|7ots-linux\.AppImage'
    ;;
  mac)
    DMG="$DIR/7ots-mac.dmg"
    [ -f "$DMG" ] || fail "missing $DMG"
    MNT=$(mktemp -d /tmp/7ots-dmg.XXXXXX)
    log "hdiutil attach $DMG"
    hdiutil attach -nobrowse -noautoopen -mountpoint "$MNT" "$DMG" >/dev/null
    ls "$MNT"
    rm -rf /Applications/7ots.app
    cp -R "$MNT/7ots.app" /Applications/
    hdiutil detach "$MNT" >/dev/null && MNT=
    xattr -dr com.apple.quarantine /Applications/7ots.app 2>/dev/null || true
    codesign -dv /Applications/7ots.app 2>&1 | grep -E 'Identifier|Signature|TeamIdentifier' || true
    APPDIR=/Applications/7ots.app
    [ -x "$APPDIR/Contents/MacOS/7ots" ] || fail "$APPDIR/Contents/MacOS/7ots missing"
    MATCH='/Applications/7ots\.app/'
    ;;
  win)
    SETUP="$DIR/7ots-windows.exe"
    [ -f "$SETUP" ] || fail "missing $SETUP"
    log "7ots-windows.exe /S"
    "$SETUP" /S # NSIS: returns when the (per-user, one-click) install is done; silent mode does not run the app
    APPDIR="$(cygpath -u "$LOCALAPPDATA")/Programs/7ots"
    wait_for 120 "7ots.exe installed in $APPDIR" test -f "$APPDIR/7ots.exe"
    ls "$APPDIR"
    EXE=("$(cygpath -w "$APPDIR/7ots.exe")")
    ;;
  *) fail "unknown mode $MODE" ;;
esac

# ---- first run --------------------------------------------------------------------------------------------------
health_down || fail "something already answers on $URL before the app started"
log "launch ${EXE[*]} (SEVENOTS_HOME=$SEVENOTS_HOME)"
if [ "$MODE" = mac ]; then
  # like a double click, plus the test environment (open --env: macOS 13+)
  open -n --env SEVENOTS_HOME="$SEVENOTS_HOME" --env SEVENOTS_NO_UPDATE=1 --env SEVENOTS_PET_PORT="$PORT" \
    --stdout "$OUT/app.log" --stderr "$OUT/app.log" /Applications/7ots.app ||
    { echo "::warning::open --env failed, launching the binary"; nohup "$APPDIR/Contents/MacOS/7ots" >"$OUT/app.log" 2>&1 & }
else
  nohup "${EXE[@]}" >"$OUT/app.log" 2>&1 &
fi

wait_for 90 "identity.json created in SEVENOTS_HOME" identity
wait_for 90 "daemon answers $URL/health" health_ok
wait_for 60 "pet window up" window_up
log "health: $(health)"
log "letting the pet live ${SETTLE}s"
sleep "$SETTLE"
procs
health_ok || fail "the daemon stopped answering after ${SETTLE}s"
main_up || fail "the app's main process is gone after ${SETTLE}s"
window_up || fail "no pet window after ${SETTLE}s"
[ "$MODE" = deb ] || [ "$MODE" = appimage ] && xwininfo -root -tree | grep '7ots"' || true
screenshot pet

# ---- quit -------------------------------------------------------------------------------------------------------
TOKEN=$(tr -d '\r\n' <"$SHOME/pet.token")
log "POST /quit"
curl -fsS --max-time 10 -X POST -H "X-7ots-Token: $TOKEN" -H 'Content-Type: application/json' -d '{}' "$URL/quit"
echo
wait_for 30 "daemon stopped" health_down
# the window leaves when its daemon has been gone ~25 s (cli/pet/electron/main.cjs watchdog)
wait_for 90 "every 7ots process exited" none_left
cp "$SHOME/pet.log" "$OUT/pet.log" 2>/dev/null || true

# ---- uninstall --------------------------------------------------------------------------------------------------
case "$MODE" in
  deb)
    if [ "${E2E_DEB_EXTRACT:-}" != 1 ]; then
      log "sudo apt remove 7ots"
      sudo DEBIAN_FRONTEND=noninteractive apt-get remove -y 7ots
      [ ! -e /opt/7ots/7ots ] || fail "/opt/7ots/7ots still there after apt remove"
      ! command -v 7ots >/dev/null || fail "7ots still on PATH after apt remove"
      ! dpkg -s 7ots 2>/dev/null | grep -q '^Status: install ok installed' || fail "dpkg still lists 7ots as installed"
    fi
    ;;
  mac) rm -rf /Applications/7ots.app ;;
  win)
    UN="$APPDIR/Uninstall 7ots.exe"
    if [ -f "$UN" ]; then
      log "Uninstall 7ots.exe /S"
      "$(cygpath -w "$UN")" /S
      wait_for 120 "7ots.exe removed" test ! -f "$APPDIR/7ots.exe"
    else
      echo "::warning::no uninstaller at $UN"
    fi
    ;;
esac
log "PASS"
