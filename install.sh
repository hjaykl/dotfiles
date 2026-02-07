#!/bin/bash
set -e

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Dotfiles bootstrap: $DOTFILES_DIR"
echo ""

# --- Homebrew ---
if ! command -v brew &>/dev/null; then
  echo "==> Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
else
  echo "==> Homebrew already installed"
fi

# --- Brew packages ---
BREW_PACKAGES=(
  stow
  neovim
  lazygit
  zoxide
  eza
  fzf
  fd
  ripgrep
  yazi
  tmux
  nvm
  go
  luarocks
  gnupg
  tree-sitter-cli
)

echo ""
echo "==> Installing brew packages..."
brew install "${BREW_PACKAGES[@]}"

# --- Node via nvm ---
echo ""
echo "==> Setting up Node via nvm..."
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"

if ! command -v node &>/dev/null; then
  echo "==> Installing latest Node LTS..."
  nvm install --lts
else
  echo "==> Node already installed: $(node --version)"
fi

# --- npm global packages ---
NPM_PACKAGES=(
  pnpm
  bun
)

echo ""
echo "==> Installing global npm packages..."
npm install -g "${NPM_PACKAGES[@]}"

# --- Stow ---
echo ""
echo "==> Linking dotfiles with stow..."
cd "$DOTFILES_DIR"
stow .

# --- Summary ---
echo ""
echo "==> Bootstrap complete!"
echo "  brew packages: ${BREW_PACKAGES[*]}"
echo "  npm packages:  ${NPM_PACKAGES[*]}"
echo "  dotfiles linked via stow"
echo ""
echo "Open a new terminal to pick up all changes."
