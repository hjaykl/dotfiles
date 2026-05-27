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

echo "==> Bootstrap complete. Open a new terminal to pick up changes."
