---
name: notetaking
description: Create, list, search, and manage text notes stored as individual files in ~/Notes. Use when the user wants to write, find, or organize notes.
---

# Notetaking

A simple file-based note-taking system. All notes are stored as individual Markdown files in `~/Notes`.

## Setup

No setup required. The directory `~/Notes` is created on first use.

## Conventions

- Each note is a single `.md` file in `~/Notes/`.
- Filenames use lowercase, hyphens for spaces: `project-ideas.md`.
- The first line of each file is a `# Title` heading.
- Optional `tags:` line follows the title (comma-separated, e.g. `tags: work, ideas`).
- Notes are organized by topic — one file per note.

## How to Use

### Create a Note

Write notes directly using the `write` tool. The file should be saved to `~/Notes/` with a date-prefixed filename:

```
~/Notes/2026-06-27-project-ideas.md
```

Format:
- First line: `# Title` heading
- Optional second line: `tags: tag1, tag2, tag3`
- Rest: note content with markdown formatting

### List Notes

Use `ls ~/Notes/` to list all notes, sorted by filename (newest first with date prefix).

### Search Notes

Use `grep -r "query" ~/Notes/` to search across all notes.

### View a Note

Use `read` tool or `cat ~/Notes/filename.md` to view a note.

### Edit a Note

Use the `edit` tool to modify existing notes, or append content by reading, modifying, and rewriting.

### Delete a Note

Use `rm ~/Notes/filename.md` to remove a note.

## Tips

- Use descriptive, concise filenames.
- For long notes, consider using headings and bullet points.
- Date-prefixed filenames make chronological browsing easy.
