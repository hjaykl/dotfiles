# Dotfiles

This repo bootstraps a reproducible macOS dev environment via `install.sh`.

## Installing new tools

If you install something the setup depends on — an LSP, formatter, CLI tool, runtime, GUI app — it **must** be added to one of these files so `install.sh` reproduces it on a fresh machine. If it isn't, the next bootstrap will be silently broken.

- **Homebrew package or cask** → add to `Brewfile`. Re-run `brew bundle` to verify.
- **Global npm package** → add an `npm install -g <pkg>` line to `install-npm.sh`. Re-run the script to verify.
- **Anything else** (curl-piped installer, `cargo install`, `rustup`, `pipx install`, custom binary, etc.) → add the install step directly to `install.sh` in a labelled section.

Rule of thumb: if you typed an install command and the next person on a fresh laptop wouldn't know to run it, it belongs in one of these files.
