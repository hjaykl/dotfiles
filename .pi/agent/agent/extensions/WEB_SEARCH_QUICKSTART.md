# Web Search Quick Start

Get up and running with web search in 3 steps.

## 1. Get an API Key

Visit https://kagi.com/api/keys and generate a Kagi API key.

## 2. Configure the Key

Create or edit `~/.pi/agent/.env`:

```bash
KAGI_API_KEY=your_api_key_here
```

## 3. Start Searching

In a pi session:

```
Use web_search to search the web:
web_search(query="your query here")
```

The search runs in the background. You'll be notified when it completes.

## Quick Examples

### Basic Search
```
web_search(query="TypeScript 5.5 features")
```

### With Options
```
web_search({
  query: "macOS development tips",
  limit: 15,
  timerange: "month"
})
```

### Get Results
```
wait_tool_call(toolCallId="<id-from-search>")
```

## Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `query` | string | required | Search query string |
| `limit` | number | 10 | Number of results (max: 50) |
| `safe_search` | boolean | true | Filter NSFW content |
| `timerange` | string | undefined | Time filter: "day", "week", "month", "year" |

## Tips

- Searches run in background tmux windows
- Use `wait_tool_call` to block for results
- Use `check_tool_call` to peek at progress
- Results include related questions when available

## Next Steps

See [WEB_SEARCH_KAGI_README.md](WEB_SEARCH_KAGI_README.md) for detailed documentation.