# Web Search (Kagi)

Search the web using the Kagi Search API. Searches run as background tool calls in separate tmux windows.

## Setup

### 1. Get a Kagi API Key

1. Visit https://kagi.com/api/keys
2. Sign in or create a Kagi account
3. Generate an API key
4. Copy the key

### 2. Configure the API Key

Add your key to `~/.pi/agent/.env`:

```bash
KAGI_API_KEY=your_api_key_here
```

The extension reads this file automatically — the key never appears on the command line.

### 3. Verify Installation

```bash
# Check if the key is loaded
cat ~/.pi/agent/.env

# Test the search script directly
node ~/.pi/agent/extensions/lib/kagi-search.mjs <base64-params>
```

## Usage

### Basic Search

```typescript
const result = await web_search({
  query: "TypeScript 5.5 new features"
});
```

This returns immediately with a `toolCallId`. The search runs in the background.

### Get Results

```typescript
// Block until complete
const output = await wait_tool_call({
  toolCallId: "<returned-id>",
  timeout: 60
});
```

### Check Progress

```typescript
// Peek at live progress
const status = await check_tool_call({
  toolCallId: "<returned-id>"
});
```

### Advanced Options

```typescript
const result = await web_search({
  query: "macOS development best practices",
  limit: 20,           // Number of results (default: 10, max: 50)
  safe_search: true,   // Filter NSFW content (default: true)
  timerange: "month"   // Time filter: "day", "week", "month", "year"
});
```

## Output Format

Search results are formatted as:

```
Search results for "query":

1. **Title** (published time)
   URL: https://example.com
   Snippet text...

2. **Another Title**
   URL: https://example.org
   More snippet...

**Related Questions:**
1. Related question 1?
2. Related question 2?
```

## When to Use

Use `web_search` when:

- You need **current information** (news, releases, updates)
- The user asks about **recent events** or **latest developments**
- You need **time-sensitive facts** that may have changed
- You're researching a topic with evolving information

Do NOT use for:

- Static information (already in your training data)
- Code analysis (use file tools instead)
- General knowledge questions

## Examples

### Finding Latest Documentation

```
web_search({
  query: "React 19 documentation hooks",
  timerange: "month"
})
```

### Researching Best Practices

```
web_search({
  query: "PostgreSQL performance tuning 2026",
  limit: 15
})
```

### Checking Recent News

```
web_search({
  query: "Node.js LTS release schedule",
  timerange: "week"
})
```

## Troubleshooting

### "KAGI_API_KEY is not set"

**Cause**: API key not configured.

**Fix**: Add to `~/.pi/agent/.env`:
```bash
KAGI_API_KEY=your_actual_key
```

### "Search failed with status 401"

**Cause**: Invalid or expired API key.

**Fix**: Regenerate your key at https://kagi.com/api/keys

### No Results Found

**Cause**: Query may be too specific or no results match.

**Fix**: Try a broader query or remove filters.

## Architecture

The web search extension works as follows:

1. User calls `web_search(query)`
2. Extension spawns a background tmux window running `kagi-search.mjs`
3. Kagi API is called with the query parameters
4. Results are formatted and written to `result.done`
5. Parent agent is notified automatically
6. Results can be retrieved with `wait_tool_call` or `check_tool_call`

The search runs in a separate tmux window, so:
- Your main session stays responsive
- You can watch progress live by switching to the window
- Long searches don't block your workflow

## Related

- [BACKGROUND_TOOL_CALLS.md](../BACKGROUND_TOOL_CALLS.md) - Deep dive into tool calls
- [QUICKSTART.md](../QUICKSTART.md) - Getting started guide