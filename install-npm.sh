#!/usr/bin/env bash
# Global npm packages needed by the dotfiles (nvim LSPs + formatters).
set -euo pipefail

npm install -g @vtsls/language-server
npm install -g vscode-langservers-extracted
npm install -g @fsouza/prettierd
npm install -g prettier
npm install -g eslint_d
