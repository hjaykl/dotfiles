#!/usr/bin/env bash
# notes.sh — Simple file-based note-taking
# All notes stored in ~/Notes as individual .md files

set -euo pipefail

NOTES_DIR="$HOME/Notes"
mkdir -p "$NOTES_DIR"

# Slugify a title: lowercase, spaces → hyphens, remove special chars
slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//'
}

# Get today's date string
today() {
  date +%Y-%m-%d
}

# Extract tags from a note file (comma-separated after "tags:")
get_tags() {
  local file="$1"
  grep -m1 '^tags:' "$file" 2>/dev/null | sed 's/^tags:[[:space:]]*//' | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$' | sort -u
}

# Add a tag to a note file
add_tag_to_file() {
  local file="$1"
  local tag="$2"
  local tag_slug
  tag_slug=$(slugify "$tag")

  if grep -q '^tags:' "$file"; then
    # Append tag if not already present
    local existing
    existing=$(get_tags "$file")
    if echo "$existing" | grep -qx "$tag_slug"; then
      echo "Tag '$tag' already on note."
      return 0
    fi
    # Replace the tags line
    local new_tags
    new_tags=$(echo -e "${existing}\n${tag_slug}" | grep -v '^$' | sort -u | paste -sd ',' -)
    sed -i '' "s/^tags:.*/tags: $new_tags/" "$file"
  else
    # Insert a tags line after the title
    sed -i '' "1a\tags: ${tag_slug}" "$file"
  fi
  echo "Added tag '$tag'."
}

# Remove a tag from a note file
remove_tag_from_file() {
  local file="$1"
  local tag="$2"
  local tag_slug
  tag_slug=$(slugify "$tag")

  if ! grep -q '^tags:' "$file"; then
    echo "Note has no tags."
    return 0
  fi

  local existing
  existing=$(get_tags "$file")
  if ! echo "$existing" | grep -qx "$tag_slug"; then
    echo "Tag '$tag' not found on note."
    return 0
  fi

  local new_tags
  new_tags=$(echo "$existing" | grep -vx "$tag_slug" | paste -sd ',' -)
  if [ -z "$new_tags" ]; then
    # Remove the tags line entirely
    sed -i '' '/^tags:/d' "$file"
  else
    sed -i '' "s/^tags:.*/tags: $new_tags/" "$file"
  fi
  echo "Removed tag '$tag'."
}

# --- Commands ---

cmd_create() {
  local title="$1"
  local content="$2"
  local tags="${3:-}"
  local slug
  slug=$(slugify "$title")
  local filename="$(today)-${slug}.md"
  local filepath="$NOTES_DIR/$filename"

  if [ -f "$filepath" ]; then
    echo "Error: Note '$title' already exists as $filename" >&2
    exit 1
  fi

  cat > "$filepath" <<EOF
# $title
$( [ -n "$tags" ] && echo "tags: $tags" )

$content
EOF

  echo "Created: $filepath"
}

cmd_list() {
  local show_tags="${2:-}"
  if [ -d "$NOTES_DIR" ] && [ "$(ls -A "$NOTES_DIR" 2>/dev/null)" ]; then
    echo "Notes in $NOTES_DIR:"
    echo "────────────────────"
    for f in $(ls -t "$NOTES_DIR"/*.md 2>/dev/null); do
      local title
      title=$(head -1 "$f" | sed 's/^# *//')
      if [ "$show_tags" = "-t" ] || [ "$show_tags" = "--tags" ]; then
        local tags
        tags=$(get_tags "$f" | paste -sd ',' -)
        if [ -n "$tags" ]; then
          echo "  $(basename "$f")  — $title  [${tags}]"
        else
          echo "  $(basename "$f")  — $title"
        fi
      else
        echo "  $(basename "$f")  — $title"
      fi
    done
  else
    echo "No notes yet. Create one with: notes create <title> \"<content>\""
  fi
}

cmd_search() {
  local query="$1"
  local results
  results=$(grep -li "$query" "$NOTES_DIR"/*.md 2>/dev/null || true)

  if [ -z "$results" ]; then
    echo "No notes found matching '$query'."
    return
  fi

  echo "Notes matching '$query':"
  echo "──────────────────────"
  for f in $results; do
    local title
    title=$(head -1 "$f" | sed 's/^# *//')
    local tags
    tags=$(get_tags "$f" | paste -sd ',' -)
    echo ""
    echo "  $(basename "$f")  — $title"
    [ -n "$tags" ] && echo "    Tags: $tags"
    echo "  ---"
    grep -n -i "$query" "$f" | head -3 | sed 's/^/    /'
  done
}

cmd_view() {
  local title="$1"
  local slug
  slug=$(slugify "$title")

  # Find the matching file (most recent match)
  local file
  local today_str
  today_str=$(today)
  file=$(ls -t "$NOTES_DIR"/*.md 2>/dev/null | grep -E "/${today_str}-${slug}\.md$|/${slug}\.md$" | head -1 || true)

  # Fallback: partial match
  if [ -z "$file" ]; then
    file=$(ls "$NOTES_DIR"/*.md 2>/dev/null | grep "$slug" | head -1 || true)
  fi

  if [ -z "$file" ]; then
    echo "Error: Note '$title' not found." >&2
    exit 1
  fi

  cat "$file"
}

cmd_tag() {
  local action="$1"
  local title="$2"
  local tag="${3:-}"
  local slug
  slug=$(slugify "$title")

  # Find the note file
  local file
  local today_str
  today_str=$(today)
  file=$(ls -t "$NOTES_DIR"/*.md 2>/dev/null | grep -E "/${today_str}-${slug}\.md$|/${slug}\.md$" | head -1 || true)

  if [ -z "$file" ]; then
    file=$(ls "$NOTES_DIR"/*.md 2>/dev/null | grep "$slug" | head -1 || true)
  fi

  if [ -z "$file" ]; then
    echo "Error: Note '$title' not found." >&2
    exit 1
  fi

  case "$action" in
    add)
      [ -z "$tag" ] && { echo "Usage: notes tag add <title> <tag>" >&2; exit 1; }
      add_tag_to_file "$file" "$tag"
      ;;
    remove)
      [ -z "$tag" ] && { echo "Usage: notes tag remove <title> <tag>" >&2; exit 1; }
      remove_tag_from_file "$file" "$tag"
      ;;
    list)
      echo "Tags on '$title':"
      local tags
      tags=$(get_tags "$file")
      if [ -z "$tags" ]; then
        echo "  (no tags)"
      else
        echo "$tags" | while read -r t; do
          echo "  - $t"
        done
      fi
      ;;
    *)
      echo "Usage: notes tag (add|remove|list) <title> [tag]" >&2
      exit 1
      ;;
  esac
}

cmd_tags() {
  local subcmd="${1:-list}"
  case "$subcmd" in
    list)
      echo "All tags and their notes:"
      echo "────────────────────────"
      local all_tags
      all_tags=$(for f in "$NOTES_DIR"/*.md; do get_tags "$f"; done | sort -u)
      if [ -z "$all_tags" ]; then
        echo "  (no tags used yet)"
        return
      fi
      echo "$all_tags" | while read -r tag; do
        echo "  #$tag:"
        for f in "$NOTES_DIR"/*.md; do
          if get_tags "$f" | grep -qx "$tag"; then
            local title
            title=$(head -1 "$f" | sed 's/^# *//')
            echo "    - $(basename "$f")  — $title"
          fi
        done
      done
      ;;
    notes)
      local tag="$2"
      [ -z "$tag" ] && { echo "Usage: notes tags notes <tag>" >&2; exit 1; }
      local tag_slug
      tag_slug=$(slugify "$tag")
      echo "Notes with tag '$tag':"
      echo "─────────────────────"
      local found=0
      for f in $(ls -t "$NOTES_DIR"/*.md 2>/dev/null); do
        if get_tags "$f" | grep -qx "$tag_slug"; then
          local title
          title=$(head -1 "$f" | sed 's/^# *//')
          echo "  $(basename "$f")  — $title"
          found=1
        fi
      done
      if [ $found -eq 0 ]; then
        echo "  (no notes with this tag)"
      fi
      ;;
    *)
      echo "Usage: notes tags (list|notes <tag>)" >&2
      exit 1
      ;;
  esac
}

cmd_edit() {
  local title="$1"
  local content="$2"
  local slug
  slug=$(slugify "$title")

  # Find existing note (most recent match)
  local file
  file=$(ls -t "$NOTES_DIR"/*.md 2>/dev/null | grep -E "/${slug}\.md$" | head -1 || true)

  if [ -z "$file" ]; then
    # Create new note
    local filename="$(today)-${slug}.md"
    file="$NOTES_DIR/$filename"
    cat > "$file" <<EOF
# $title

$content
EOF
    echo "Created new note: $file"
    return
  fi

  # Append to existing note
  echo "" >> "$file"
  echo "---" >> "$file"
  echo "$content" >> "$file"
  echo "Updated: $file"
}

cmd_delete() {
  local title="$1"
  local slug
  slug=$(slugify "$title")

  local file
  file=$(ls "$NOTES_DIR"/*.md 2>/dev/null | grep "$slug" | head -1 || true)

  if [ -z "$file" ]; then
    echo "Error: Note '$title' not found." >&2
    exit 1
  fi

  rm "$file"
  echo "Deleted: $file"
}

# --- Main ---

case "${1:-help}" in
  create)
    [ $# -lt 3 ] && { echo "Usage: notes create <title> \"<content>\" [tags]" >&2; exit 1; }
    cmd_create "$2" "$3" "${4:-}"
    ;;
  list)
    cmd_list "${2:-}"
    ;;
  search)
    [ $# -lt 2 ] && { echo "Usage: notes search <query>" >&2; exit 1; }
    cmd_search "$2"
    ;;
  view)
    [ $# -lt 2 ] && { echo "Usage: notes view <title>" >&2; exit 1; }
    cmd_view "$2"
    ;;
  tag)
    [ $# -lt 3 ] && { echo "Usage: notes tag (add|remove|list) <title> [tag]" >&2; exit 1; }
    cmd_tag "$2" "$3" "${4:-}"
    ;;
  tags)
    cmd_tags "${2:-list}" "${3:-}"
    ;;
  edit)
    [ $# -lt 3 ] && { echo "Usage: notes edit <title> \"<updates>\"" >&2; exit 1; }
    cmd_edit "$2" "$3"
    ;;
  delete)
    [ $# -lt 2 ] && { echo "Usage: notes delete <title>" >&2; exit 1; }
    cmd_delete "$2"
    ;;
  help|*)
    echo "notes — Simple file-based note-taking"
    echo ""
    echo "Usage: notes <command> [args]"
    echo ""
    echo "Commands:"
    echo "  create <title> \"<content>\" [tags]   Create a new note (optional tags)"
    echo "  list [-t|--tags]                     List all notes (optionally show tags)"
    echo "  search <query>                       Search notes by content"
    echo "  view <title>                         View a note"
    echo "  tag add <title> <tag>                Add a tag to a note"
    echo "  tag remove <title> <tag>             Remove a tag from a note"
    echo "  tag list <title>                     List tags on a note"
    echo "  tags list                            List all tags and their notes"
    echo "  tags notes <tag>                     List notes with a specific tag"
    echo "  edit <title> \"<updates>\"            Edit (append to) a note"
    echo "  delete <title>                       Delete a note"
    ;;
esac
