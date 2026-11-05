# Shared helpers for the nvim-server integration. Source it from bash:
#   . "$HOME/.bin/lib/nvim-session.sh"
#
# One nvim per "session", listening on a socket:
#   tmux  → the tmux session name             (/tmp/nvim/<session>.sock)
#   herdr → the Herdr space, "herdr-<spaceid>" (/tmp/nvim/herdr-<id>.sock)
# $NVIM_SESSION overrides both (Herdr popups set it, since their terminal
# isn't in a space). Inside tmux, tmux wins even when tmux runs in Herdr.

NVS_DIR="${XDG_RUNTIME_DIR:-/tmp}/nvim"

# Herdr space id of a core terminal, following parents for sub-terminals.
_nvs_herdr_space() {
  local t="$1" json sp i
  command -v hc >/dev/null 2>&1 || return 1
  for i in 1 2 3 4 5; do
    [ -n "$t" ] && [ "$t" != null ] || return 1
    json=$(hc get "$t" --json 2>/dev/null) || return 1
    sp=$(printf '%s' "$json" | jq -r '.labels["herdr.space"] // empty')
    if [ -n "$sp" ]; then printf '%s' "$sp"; return 0; fi
    t=$(printf '%s' "$json" | jq -r '.parent // empty')
  done
  return 1
}

# Mode: tmux | herdr | none
nvs_mode() {
  case "${NVIM_SESSION:-}" in
    herdr-*) echo herdr; return ;;
    ?*) echo tmux; return ;;
  esac
  if [ -n "${TMUX:-}" ]; then echo tmux
  elif [ -n "${HC_TERMINAL_ID:-}" ]; then echo herdr
  else echo none
  fi
}

# Session key (socket basename).
nvs_key() {
  if [ -n "${NVIM_SESSION:-}" ]; then printf '%s' "$NVIM_SESSION"; return 0; fi
  case "$(nvs_mode)" in
    tmux) tmux display-message -p '#S' ;;
    herdr)
      local sp
      sp=$(_nvs_herdr_space "$HC_TERMINAL_ID") || return 1
      printf 'herdr-%s' "${sp//\//_}"
      ;;
    *) return 1 ;;
  esac
}

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

# Start the session's nvim-server, without waiting for it:
#   tmux  → a background window named "nvim" in the session
#   herdr → a new tab in the space (a shell stays when nvim quits)
# Starts in $NVS_CWD, else $PWD.
nvs_start() {
  local key cwd="${NVS_CWD:-$PWD}"
  key=$(nvs_key) || return 1
  case "$(nvs_mode)" in
    tmux)
      tmux new-window -d -n nvim -t "$key:" -c "$cwd" "$HOME/.bin/nvim-server"
      ;;
    herdr)
      herdr-app do tab.new --space "${key#herdr-}" --name nvim --folder "$cwd" \
        --argv "[\"$HOME/.bin/nvim-server\"]" >/dev/null 2>&1
      ;;
    *) return 1 ;;
  esac
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
  sock=$(nvs_sock) || nvs_die "nvim-server: not in tmux or Herdr"
  if nvs_alive "$sock"; then printf '%s' "$sock"; return 0; fi
  echo "nvim-server: starting one…" >&2
  nvs_start || nvs_die "nvim-server: couldn't start one"
  nvs_wait 10 || nvs_die "nvim-server didn't come up ($sock)"
  printf '%s' "$sock"
}

# Close the Herdr popup this terminal is shown in (nvim-popup mods), if any.
nvs_close_popup() {
  local overlay
  [ -n "${NVIM_POPUP:-}" ] && [ -n "${HC_TERMINAL_ID:-}" ] || return 0
  overlay=$(hc get "$HC_TERMINAL_ID" --json 2>/dev/null | jq -r '.labels["nvim.overlay"] // empty')
  [ -n "$overlay" ] && herdr-app do overlay.close --id "$overlay" >/dev/null 2>&1
  return 0
}

# Bring the session's nvim into view (and close the Herdr popup we're in).
nvs_focus() {
  local where term
  where=$(cat "$(nvs_state term)" 2>/dev/null || true)
  case "$(nvs_mode)" in
    tmux)
      term="${where#tmux:}"
      if [ "$where" != "$term" ] && [ -n "$term" ] && tmux select-window -t "$term" 2>/dev/null; then
        tmux select-pane -t "$term" 2>/dev/null || true
      else
        tmux select-window -t :1 2>/dev/null || true
      fi
      ;;
    herdr)
      nvs_close_popup
      term="${where#herdr:}"
      [ "$where" != "$term" ] && [ -n "$term" ] &&
        herdr-app do pane.focus --terminal "$term" >/dev/null 2>&1
      ;;
  esac
  return 0
}
