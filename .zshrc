export XDG_CONFIG_HOME="$HOME/.config"
export EDITOR=nvim

if [ -f ~/.env ]; then
  source ~/.env
fi

export NVM_DIR="$HOME/.nvm"
[ -s "$HOMEBREW_PREFIX/opt/nvm/nvm.sh" ] && \. "$HOMEBREW_PREFIX/opt/nvm/nvm.sh"
[ -s "$HOMEBREW_PREFIX/opt/nvm/etc/bash_completion.d/nvm" ] && \. "$HOMEBREW_PREFIX/opt/nvm/etc/bash_completion.d/nvm"

export PATH=$PATH:$HOME/go/bin

# pnpm
export PNPM_HOME="/Users/Jacob.Poole/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end

# aliases
alias rc="nvim ~/.zshrc"
alias src="source ~/.zshrc"
alias nvc="cd ~/.config/nvim"
alias nxr="pnpm nx run"
alias nxs="pnpm nx serve"
alias mya="nxs my-account"
alias mya-prod="./run-local-production.sh"
alias sb="pnpm storybook"
alias lg="lazygit"

# ---- Eza (better ls) -----

alias ls="eza --color=always --git --no-filesize --icons=always --no-time --no-user --no-permissions"

# bun completions
[ -s "/Users/Jacob.Poole/.bun/_bun" ] && source "/Users/Jacob.Poole/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

source <(fzf --zsh)

# -- Use fd instead of fzf --

export FZF_DEFAULT_COMMAND="fd --hidden --strip-cwd-prefix --exclude .git"
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_ALT_C_COMMAND="fd --type=d --hidden --strip-cwd-prefix --exclude .git"

# Use fd (https://github.com/sharkdp/fd) for listing path candidates.
# - The first argument to the function ($1) is the base path to start traversal
# - See the source code (completion.{bash,zsh}) for the details.
_fzf_compgen_path() {
  fd --hidden --exclude .git . "$1"
}

# Use fd to generate the list for directory completion
_fzf_compgen_dir() {
  fd --type=d --hidden --exclude .git . "$1"
}

# ---- Zoxide (better cd) ----
eval "$(zoxide init zsh)"

alias cd="z"

function y() {
	local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
	yazi "$@" --cwd-file="$tmp"
	if cwd="$(command cat -- "$tmp")" && [ -n "$cwd" ] && [ "$cwd" != "$PWD" ]; then
		builtin cd -- "$cwd"
	fi
	rm -f -- "$tmp"
}
