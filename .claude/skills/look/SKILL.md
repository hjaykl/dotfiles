---
name: look
description: Read the user's currently focused tmux pane.
allowed-tools: Bash
---

Capture the user's currently focused tmux pane and summarise what you see.

$ARGUMENTS

Steps:
1. Find the user's active session (not the claude session): `tmux list-sessions -F '#{session_name} #{session_attached} #{?client_prefix,,#{session_activity}}' | grep -v claude | sort -k3 -rn | head -1 | awk '{print \$1}'`
2. Find the active window and pane in that session: `tmux display-message -t <session> -p '#{window_index}.#{pane_index}'`
3. Capture the pane: `tmux capture-pane -t <session>:<window>.<pane> -p`
4. Read the output and respond to the user. If $ARGUMENTS contains a question or instruction, apply it to what you see.
