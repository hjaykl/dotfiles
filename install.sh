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
mkdir -p "$HOME/.config/herdr-app/mods" "$HOME/.agents/skills"
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

# --- Herdr (app + herdr-core/hc) ---
if [ ! -d /Applications/Herdr.app ]; then
  echo "==> Installing Herdr..."
  curl -fsSL https://releases.herdr.dev/app/install.sh | sh
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
for ext in hunk-listen.ts; do
  ln -sfn "$DOTFILES_DIR/.pi/agent/extensions/$ext" "$HOME/.pi/agent/extensions/$ext"
done

echo "==> Bootstrap complete. Open a new terminal to pick up changes."
