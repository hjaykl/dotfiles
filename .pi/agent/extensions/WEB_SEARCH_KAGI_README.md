# Web Search Extension for Pi (Kagi API)

This extension adds web search capabilities to pi using the [Kagi Search API](https://help.kagi.com/kagi/api/search.html).

## Features

- **Web Search Tool**: Allows the AI to search the web for current information, news, research, and facts
- **Direct Search Command**: Use `/kagi-search <query>` for quick searches without involving the AI
- **Configurable Parameters**: Customize search limits, safe search, and time ranges
- **Rich Results**: Returns titles, URLs, snippets, published dates, and related questions

## Setup

### 1. Get a Kagi API Key

1. Sign up for a Kagi account at https://kagi.com
2. Go to https://kagi.com/settings?p=api
3. Generate an API key

### 2. Add the API Key to pi's .env File

Create or edit `~/.pi/agent/.env` and add your API key:

```bash
# Create the .env file if it doesn't exist
touch ~/.pi/agent/.env

# Edit it with your favorite editor
nano ~/.pi/agent/.env

# Add your API key:
KAGI_API_KEY=your_api_key_here
```

**Important:** This `.env` file is local to pi and won't be added to your shell configuration. It's also gitignored by default.

### 3. Install the Extension

The extension is already installed at:
```
~/.pi/agent/extensions/web-search-kagi.ts
```

If you want to move it or create a copy:
```bash
cp ~/.pi/agent/extensions/web-search-kagi.ts ~/.pi/agent/extensions/
```

## Usage

### Automatic Web Search

Once the extension is loaded and the API key is set, you can simply ask pi to search the web:

```
pi "What are the latest features in TypeScript 5.5?"
pi "Search for news about AI developments this week"
pi "Find information about the best practices for React performance"
```

The AI will automatically use the `web_search` tool when it determines that web search is needed.

### Direct Search Command

Use the `/kagi-search` command for quick searches:

```bash
# In interactive mode
/kagi-search latest TypeScript features

# From command line
pi -p "/kagi-search React 19 new features"
```

### Tool-Only Mode

If you want to restrict pi to only use web search (no file operations):

```bash
pi --tools web_search "Search for Python best practices"
```

## Configuration

Edit the extension file to customize default search parameters:

```typescript
const CONFIG = {
  limit: 10,              // Number of results (1-50)
  safesearch: "moderate", // "off", "moderate", or "strict"
  timerange: "",          // "", "day", "week", "month", or "year"
  features: "background", // Search features
  sort: "date",          // "date", "relevancy", or ""
};
```

## Search Parameters

The `web_search` tool accepts the following parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string (required) | The search query string |
| `limit` | number (optional) | Number of results to return (1-50, default: 10) |
| `safesearch` | string (optional) | Safe search level: "off", "moderate", or "strict" |
| `timerange` | string (optional) | Time range: "day", "week", "month", or "year" |

## Example Interactions

### Example 1: News Search
```
User: What's happening with the latest climate change summit?
AI: [calls web_search with query="latest climate change summit 2026"]
AI: Found 10 results...
    1. **COP28 Climate Summit Reaches Historic Agreement**
       URL: https://example.com/news/cop28-agreement
       The summit concluded with a landmark agreement...
```

### Example 2: Technical Research
```
User: What are the new features in Node.js 22?
AI: [calls web_search with query="Node.js 22 new features"]
AI: Based on the search results, Node.js 22 introduces...
```

### Example 3: Direct Command
```
User: /kagi-search best practices for API design
[Notification shows top 5 search results with titles, URLs, and snippets]
```

## Troubleshooting

### API Key Not Set
```
Error: KAGI_API_KEY environment variable is not set
```
**Solution**: Add your API key to `~/.pi/agent/.env`:
```bash
KAGI_API_KEY=your_api_key_here
```

Or set it temporarily for the current session:
```bash
export KAGI_API_KEY=your_api_key
```

### Search Failed
```
Search failed with status 401: Unauthorized
```
**Solution**: Check that your API key is correct and has not expired.

### No Results Found
```
No results found for your search query.
```
**Solution**: Try a different or more specific search query.

## Kagi API Reference

For more information about the Kagi Search API, see:
- [Kagi Search API Documentation](https://help.kagi.com/kagi/api/search.html)
- [Kagi API Pricing](https://kagi.com/settings?p=api)

## Security Notes

- Keep your API key secret and never commit it to version control
- The `.env` file in `~/.pi/agent/` is a good place for secrets (add it to `.gitignore`)
- The extension respects the `safesearch` setting for content filtering
- Search queries are sent directly to Kagi's API

## Credits

- Extension author: Pi Assistant
- Search provider: [Kagi Search](https://kagi.com)