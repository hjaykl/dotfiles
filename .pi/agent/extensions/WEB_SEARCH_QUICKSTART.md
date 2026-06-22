# Web Search (Kagi) - Quick Reference

## Setup (One Time)

### Option 1: Using pi's .env file (Recommended)

```bash
# Get API key from https://kagi.com/settings?p=api
# Edit pi's .env file
echo 'KAGI_API_KEY=your_api_key_here' >> ~/.pi/agent/.env
```

**Benefits:**
- No need to modify shell config
- Secrets stay in pi's config directory
- Easy to manage multiple API keys

### Option 2: Environment Variable

```bash
# Set for current session only
export KAGI_API_KEY=your_api_key_here
```

## Usage

### Natural Language (Recommended)
Just ask pi to search the web:
```
"Search for the latest news on AI"
"What are the new features in Node.js 22?"
"Find information about React 19 changes"
```

### Direct Command
```
/kagi-search <your query here>
```

### Run Test
```bash
node ~/.pi/agent/extensions/test-web-search-kagi.js
```

## Configuration

Edit `~/.pi/agent/extensions/web-search-kagi.ts` to change defaults:

```typescript
const CONFIG = {
  limit: 10,              // Results count (1-50)
  safesearch: "moderate", // "off", "moderate", "strict"
  timerange: "",          // "", "day", "week", "month", "year"
};
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "API key not set" | Add to `~/.pi/agent/.env` or `export KAGI_API_KEY=your_key` |
| "Unauthorized" | Check API key is correct |
| "No results" | Try a different search query |

## API Reference

- **Kagi Search Docs**: https://help.kagi.com/kagi/api/search.html
- **Get API Key**: https://kagi.com/settings?p=api