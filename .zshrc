export XDG_CONFIG_HOME="$HOME/.config"
export EDITOR=nvim

PROMPT='%n %1~ %(#.⚡️.🐙) ' 

if [ -f ~/.env ]; then
  source ~/.env
fi

# Lines configured by zsh-newuser-install
HISTFILE=~/.histfile
HISTSIZE=1000
SAVEHIST=1000
bindkey -v
# End of lines configured by zsh-newuser-install
# The following lines were added by compinstall
zstyle :compinstall filename '/home/jacob/.zshrc'

autoload -Uz compinit
compinit
# End of lines added by compinstall

export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"  # This loads nvm
[ -s "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm" ] && \. "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm"  # This loads nvm bash_completion

export PATH=$PATH:$HOME/go/bin

export GPG_TTY=$(tty)

# pnpm (macOS only)
if [[ "$OSTYPE" == "darwin" ]]; then
  PNPM_HOME="$HOME/Library/pnpm"
  case ":$PATH:" in
    *":$PNPM_HOME:"*) ;;
    *) export PATH="$PNPM_HOME:$PATH" ;;
  esac
fi
# pnpm end

# aliases
alias rc="command nvim ~/.zshrc"
alias src="source ~/.zshrc"
alias nvc="cd ~/.config/nvim"
alias lg="lazygit"
alias oc="opencode"
alias wm="workmux"

# ---- Eza (better ls) -----

alias ls="eza --color=always --git --no-filesize --icons=always --no-time --no-user --no-permissions"

# bun completions (macOS only)
if [[ "$OSTYPE" == "darwin" ]] && [ -s "$HOME/.bun/_bun" ]; then
  source "$HOME/.bun/_bun"
fi

# bun (macOS only)
if [[ "$OSTYPE" == "darwin" ]]; then
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi

# fzf (only if installed)
if command -v fzf &>/dev/null; then
  source <(fzf --zsh)

  # -- Use fd instead of fzf --
  export FZF_DEFAULT_COMMAND="fd --hidden --strip-cwd-prefix --exclude .git"
  export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
  export FZF_ALT_C_COMMAND="fd --type=d --hidden --strip-cwd-prefix --exclude .git"

  # Use fd for listing path candidates.
  _fzf_compgen_path() {
    fd --hidden --exclude .git . "$1"
  }

  # Use fd to generate the list for directory completion
  _fzf_compgen_dir() {
    fd --type=d --hidden --exclude .git . "$1"
  }
fi

# ---- Zoxide (better cd) ----
if command -v zoxide &>/dev/null; then
  eval "$(zoxide init zsh)"
  alias cd="z"
fi

# SSH wrapper to fix terminal issues on remote hosts
# Fixes backspace and character display problems
ssh() {
  if [[ -n "$TMUX" ]]; then
    echo "ssh is disabled inside tmux. Detach or run from a plain terminal." >&2
    return 1
  fi
  # Force TERM to a widely-supported value
  TERM=xterm-256color command ssh "$@"
}

# Alternative: use this alias to automatically fix stty after SSH
# alias ssh='TERM=xterm-256color ssh; stty erase ^H'

# yazi (only if installed)
if command -v yazi &>/dev/null; then
  function y() {
    local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
    yazi "$@" --cwd-file="$tmp"
    if cwd="$(command cat -- "$tmp")" && [ -n "$cwd" ] && [ "$cwd" != "$PWD" ]; then
      builtin cd -- "$cwd"
    fi
    rm -f -- "$tmp"
  }
fi
export PATH="$HOME/.local/bin:$HOME/.bin:$PATH"
export PATH="$HOME/.luarocks/bin:$PATH" 2>/dev/null || true

autoload -U add-zsh-hook

load-nvmrc() {
  if [[ -f .nvmrc ]] && command -v nvm &>/dev/null; then
    nvm use --silent
  fi
}

add-zsh-hook chpwd load-nvmrc
load-nvmrc

# opencode (only if installed)
if [[ -d "$HOME/.opencode/bin" ]]; then
  export PATH="$HOME/.opencode/bin:$PATH"
fi

# Cursor styling (only if terminal supports it)
if [[ -n $TERM ]]; then
  function zle-keymap-select {
    if [[ $KEYMAP == vicmd ]]; then
      echo -ne '\e[1 q'  # blinking block
    else
      echo -ne '\e[5 q'  # blinking bar
    fi
  }
  function zle-line-init {
    echo -ne '\e[5 q'
  }
  zle -N zle-keymap-select
  zle -N zle-line-init
  KEYTIMEOUT=1
fi

# direnv (only if installed)
if command -v direnv &>/dev/null; then
  eval "$(direnv hook zsh)"
fi

export PATH="$HOME/Library/Python/3.9/bin:$PATH" 2>/dev/null || true

# LM Studio (only if installed)
if [[ -d "$HOME/.lmstudio/bin" ]]; then
  export PATH="$PATH:$HOME/.lmstudio/bin"
fi

