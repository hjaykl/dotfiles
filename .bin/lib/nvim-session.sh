# Shared helpers for the Rex integration. Source it from bash:
#   . "$HOME/.bin/lib/nvim-session.sh"
#
# One nvim per Rex session, listening on a socket named after the session:
#   ${XDG_RUNTIME_DIR:-/tmp}/nvim/rex-<session id>.sock
# $NVIM_SESSION overrides the key.

NVS_DIR="${XDG_RUNTIME_DIR:-/tmp}/nvim"

# The rex CLI, also where it isn't on PATH (e.g. commands run by Rex itself).
if ! command -v rex >/dev/null 2>&1; then
  rex() { "$HOME/Library/Application Support/com.superlogical.rex/RexServer/Versions/Current/Rex Server.app/Contents/MacOS/rex" "$@"; }
fi

# Session key (socket basename): rex-<session id>.
nvs_key() {
  if [ -n "${NVIM_SESSION:-}" ]; then printf '%s' "$NVIM_SESSION"; return 0; fi
  [ -n "${REX_SESSION:-}" ] || return 1
  printf 'rex-%s' "${REX_SESSION#session:}"
}

# The Rex session id (session:...).
nvs_session() { local k; k=$(nvs_key) || return 1; printf 'session:%s' "${k#rex-}"; }

nvs_sock() { local k; k=$(nvs_key) || return 1; printf '%s/%s.sock' "$NVS_DIR" "$k"; }
nvs_state() { local k; k=$(nvs_key) || return 1; printf '%s/%s.%s' "$NVS_DIR" "$k" "$1"; }

# Is a live nvim listening on $1?
nvs_alive() { [ -S "$1" ] && nvim --server "$1" --remote-expr '1' </dev/null >/dev/null 2>&1; }

# Print an error; in a popup, hold it on screen long enough to read.
nvs_die() {
  echo "$*" >&2
  if [ -n "${NVIM_POPUP:-}" ]; then
    printf '\n[press any key]' >&2
    read -rsn1 -t 10 || true
  fi
  exit 1
}

# Run a command in a new window of this session, labelled LABEL.
#   nvs_rex_window LABEL CWD FOCUS(true|false) COMMAND...
# Prints the window id.
nvs_rex_window() {
  local label="$1" cwd="$2" focus="$3" sess win
  shift 3
  sess=$(nvs_session) || return 1
  win=$(rex run -s "$sess" --json --label "$label" --focus="$focus" -c "$cwd" -- "$@" 2>/dev/null |
    jq -r '.window_id // empty') || return 1
  [ -n "$win" ] || return 1
  rex window rename -s "$sess" "$win" "$label" >/dev/null 2>&1 || true
  printf '%s' "$win"
}

# Focus a block and make the Rex app show its window. `rex focus` alone moves
# the session's focus but leaves the app on the tab it was showing.
nvs_rex_show() {
  local block="$1" sess win client
  sess=$(nvs_session) || return 1
  rex focus -s "$sess" "$block" >/dev/null 2>&1 || return 1
  win=$(rex window ls -s "$sess" --json 2>/dev/null | jq -r --arg b "$block" \
    'first(.windows[] | select(any(.layers[].blocks[]?; .block_id == $b)) | .window_id) // empty')
  [ -n "$win" ] || return 0
  for client in $(rex client ls --json 2>/dev/null | jq -r --arg s "$sess" \
    '.clients[] | select(.info.kind == "app" and any(.session_ids[]?; . == $s)) | .client_id'); do
    rex -C "$client" do session.select session_id="$sess" window_id="$win" >/dev/null 2>&1 || true
  done
  return 0
}

# Start the session's nvim-server in a background window labelled "nvim",
# without waiting for it. Starts in $NVS_CWD, else $PWD.
nvs_start() {
  nvs_rex_window nvim "${NVS_CWD:-$PWD}" false "$HOME/.bin/nvim-server" >/dev/null
}

# Wait up to $1 seconds (default 10) for a live server on the session socket.
nvs_wait() {
  local sock i
  sock=$(nvs_sock) || return 1
  for i in $(seq 1 $(( ${1:-10} * 10 ))); do
    nvs_alive "$sock" && return 0
    sleep 0.1
  done
  return 1
}

# Socket of a live nvim-server, starting one when there isn't one yet; or die.
nvs_require() {
  local sock
  sock=$(nvs_sock) || nvs_die "nvim-server: not in Rex"
  if nvs_alive "$sock"; then printf '%s' "$sock"; return 0; fi
  echo "nvim-server: starting one…" >&2
  nvs_start || nvs_die "nvim-server: couldn't start one"
  nvs_wait 10 || nvs_die "nvim-server didn't come up ($sock)"
  printf '%s' "$sock"
}

# Close the Rex popup (floating layer) this terminal is in, if any, once the
# calling script has finished.
nvs_close_popup() {
  [ -n "${NVIM_POPUP:-}" ] && [ -n "${REX_BLOCK:-}" ] || return 0
  nohup sh -c 'i=0; while kill -0 "$1" 2>/dev/null && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done
    rex block close "$2"' sh "$$" "$REX_BLOCK" </dev/null >/dev/null 2>&1 &
  return 0
}

# Bring the session's nvim into view (and close the popup we're in).
nvs_focus() {
  local where
  nvs_close_popup
  where=$(cat "$(nvs_state block)" 2>/dev/null || true)
  [ -n "$where" ] && nvs_rex_show "$where"
  return 0
}
