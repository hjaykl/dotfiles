#!/usr/bin/env bash
# Bootstrap: install everything the dotfiles need on a fresh macOS machine.
# Safe to re-run.
set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DOTFILES_DIR"

echo "==> Dotfiles bootstrap: $DOTFILES_DIR"

# --- Homebrew ---
if ! command -v brew >/dev/null 2>&1; then
  echo "==> Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# --- Brew packages (declared in Brewfile) ---
echo "==> brew bundle..."
brew bundle --file="$DOTFILES_DIR/Brewfile"

# --- Symlink dotfiles into $HOME ---
# Folders apps also write into must exist first, so stow links the files in
# them instead of folding the whole folder into this repo.
mkdir -p "$HOME/.agents/skills"
echo "==> Linking dotfiles via stow..."
stow --target="$HOME" --restow .

# --- Node via nvm ---
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"

if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing Node LTS via nvm..."
  nvm install --lts
fi

# --- npm globals (declared in install-npm.sh) ---
echo "==> Installing npm globals..."
"$DOTFILES_DIR/install-npm.sh"

# --- Rex (terminal multiplexer; config in .config/rex/init.lua) ---
# In beta, with no install script: install the app by hand. Then run
# "Install Rex for Agents" from its command palette, which adds Rex's skill
# and a SessionStart hook to Claude Code (~/.claude/settings.json).
if [ ! -d "/Applications/Rex Beta.app" ] && [ ! -d /Applications/Rex.app ]; then
  echo "==> Rex is not installed: install the Rex app, then run 'Install Rex for Agents' in it."
fi

# --- Claude Code (main coding agent; config in .claude/) ---
if ! command -v claude >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/claude" ]; then
  echo "==> Installing Claude Code..."
  curl -fsSL https://claude.ai/install.sh | bash
fi
# MCP servers (user scope, stored in ~/.claude.json). Secrets stay as ${VAR}
# references, expanded from the environment when Claude starts.
CLAUDE_BIN="$(command -v claude || echo "$HOME/.local/bin/claude")"
if ! "$CLAUDE_BIN" mcp get kagi >/dev/null 2>&1; then
  echo "==> Adding Kagi MCP server to Claude Code (needs KAGI_API_KEY in env)..."
  "$CLAUDE_BIN" mcp add --scope user --transport http kagi https://mcp.kagi.com/mcp \
    --header 'Authorization: Bearer ${KAGI_API_KEY}'
fi

# --- Hunk (diff viewer: git pager/difftool, lazygit pager) ---
if ! command -v hunk >/dev/null 2>&1 && [ ! -x "$HOME/.hunk/bin/hunk" ]; then
  echo "==> Installing Hunk..."
  curl -fsSL https://hunk.dev/install.sh | sh
fi

# --- pi (coding agent) + the extensions this setup uses ---
if ! command -v pi >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/pi" ]; then
  echo "==> Installing pi..."
  curl -fsSL https://pi.dev/install.sh | sh
fi
mkdir -p "$HOME/.pi/agent/extensions"
# hunk-listen.ts: /hunk-listen makes that pi receive Hunk review notes.
# web-search-kagi.ts: the web_search tool (Kagi; KAGI_API_KEY from ~/.env or
# ~/.pi/agent/.env), with its helpers in lib/.
# Skipped when ~/.pi/agent/extensions already is this repo's folder (an older
# setup linked ~/.pi itself here): pi loads these from it directly, and
# linking would replace the repo's files with links to themselves.
if [ "$(cd "$HOME/.pi/agent/extensions" && pwd -P)" != "$(cd "$DOTFILES_DIR/.pi/agent/extensions" && pwd -P)" ]; then
  ln -sfn "$DOTFILES_DIR/.pi/agent/extensions/hunk-listen.ts" "$HOME/.pi/agent/extensions/hunk-listen.ts"
  ln -sfn "$DOTFILES_DIR/.pi/agent/extensions/web-search-kagi.ts" "$HOME/.pi/agent/extensions/web-search-kagi.ts"
  ln -sfn "$DOTFILES_DIR/.pi/agent/extensions/lib" "$HOME/.pi/agent/extensions/lib"
  rm -f "$HOME/.pi/agent/extensions/workflow-modes"  # removed with Herdr
fi
rm -f "$HOME/.pi/agent/extensions/herdr-agent-state.ts"  # installed by herdr

echo "==> Bootstrap complete. Open a new terminal to pick up changes."
