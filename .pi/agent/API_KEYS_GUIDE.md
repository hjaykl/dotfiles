# Managing API Keys and Environment Variables in Pi

This guide explains how to store API keys and environment variables for pi without adding them to your shell configuration.

## The `.env` File

Pi provides a dedicated environment file at `~/.pi/agent/.env` for storing secrets and API keys.

### Why Use This Approach?

✅ **No shell config changes** - Don't need to modify `.zshrc`, `.bashrc`, etc.  
✅ **Centralized location** - All pi-related secrets in one place  
✅ **Git-safe** - This file should never be committed to version control  
✅ **Automatic loading** - Extensions can load from this file automatically  
✅ **Easy management** - Simple text file, easy to edit and backup  

## Setup

### 1. Create the .env File

```bash
# Create the file if it doesn't exist
touch ~/.pi/agent/.env

# Or edit it directly
nano ~/.pi/agent/.env
# or
code ~/.pi/agent/.env  # if using VS Code
# or
vim ~/.pi/agent/.env
```

### 2. Add Your API Keys

Add lines in `KEY=value` format:

```env
# Kagi Search
KAGI_API_KEY=your_kagi_key_here

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Google
GOOGLE_API_KEY=...

# GitHub
GITHUB_TOKEN=...

# Custom services
MY_SERVICE_API_KEY=...
```

### 3. Format Guidelines

- One variable per line
- No spaces around `=`
- Values can be quoted or unquoted
- Comments start with `#`
- Variable names should be uppercase

```env
# This is a comment
API_KEY=secret123
API_KEY_WITH_QUOTES="secret with spaces"
ANOTHER_KEY='also works'
```

## Using API Keys

### In Extensions

Extensions can automatically load from the `.env` file:

```typescript
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile() {
  try {
    const envPath = join(process.env.HOME, ".pi", "agent", ".env");
    const content = readFileSync(envPath, "utf-8");
    
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        const value = trimmed.substring(eqIndex + 1).trim();
        process.env[key] = value;
      }
    }
  } catch (error) {
    // .env file is optional
  }
}

// Use in your extension
loadEnvFile();
const apiKey = process.env.MY_API_KEY;
```

### From Command Line

API keys in `.env` are automatically available to pi extensions, but for CLI usage:

```bash
# Option 1: Source the .env file
export $(cat ~/.pi/agent/.env | grep -v '^#' | xargs)
pi "search for something"

# Option 2: Set specific key
export KAGI_API_KEY=$(grep '^KAGI_API_KEY=' ~/.pi/agent/.env | cut -d'=' -f2)
pi "search for something"

# Option 3: Use directly in command
KAGI_API_KEY=$(grep '^KAGI_API_KEY=' ~/.pi/agent/.env | cut -d'=' -f2) pi "search"
```

## Security Best Practices

### 1. Protect Your .env File

```bash
# Set restrictive permissions
chmod 600 ~/.pi/agent/.env

# Verify permissions
ls -la ~/.pi/agent/.env
# Should show: -rw------- 1 user user ...
```

### 2. Add to .gitignore

If you have a project-level `.gitignore`, add:

```gitignore
# Pi environment file
.pi/agent/.env

# Any other .env files
.env
.env.local
.env.*.local
```

### 3. Never Commit Secrets

- Never add API keys to version control
- Use `.gitignore` to prevent accidental commits
- Consider using different keys for development and production

### 4. Rotate Keys Regularly

- Periodically regenerate API keys
- Update the `.env` file with new keys
- Revoke old keys from the service provider

## Managing Multiple Projects

### Project-Specific Keys

For project-specific API keys, create `.pi/settings.json`:

```json
{
  "extensions": [
    "./pi-extensions/project-specific.ts"
  ]
}
```

Then in your extension, load project-specific env vars:

```typescript
const projectEnvPath = join(ctx.cwd, ".pi", ".env");
// Load project-specific overrides
```

### Global vs Project Keys

- **Global** (`~/.pi/agent/.env`): Personal API keys for all projects
- **Project** (`.pi/.env`): Project-specific secrets (add to `.gitignore`)

## Example: Complete .env File

```env
# ============================================
# Pi Environment Variables
# Store API keys and secrets here
# NEVER commit this file to version control
# ============================================

# Search APIs
KAGI_API_KEY=your_kagi_api_key_here
BRAVE_SEARCH_API_KEY=...

# LLM Providers
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
DEEPSEEK_API_KEY=...

# Code Hosting
GITHUB_TOKEN=ghp_...
GITLAB_TOKEN=...

# Cloud Services
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
GOOGLE_APPLICATION_CREDENTIALS=...

# Custom Services
MY_CUSTOM_API_KEY=...
```

## Troubleshooting

### API Key Not Found

**Problem:** Extension can't find the API key

**Solutions:**
1. Check the `.env` file exists: `ls -la ~/.pi/agent/.env`
2. Verify the key is set: `grep KAGI_API_KEY ~/.pi/agent/.env`
3. Check for typos in the key name
4. Restart pi after adding new keys

### Key Not Working

**Problem:** API key is set but not working

**Solutions:**
1. Check for extra whitespace: Open the file and verify no leading/trailing spaces
2. Remove quotes if present: `KEY=value` not `KEY="value"`
3. Verify the key is valid with the service provider
4. Check file permissions: `chmod 600 ~/.pi/agent/.env`

### Loading Issues

**Problem:** Extension doesn't load env vars

**Solutions:**
1. Ensure the extension calls `loadEnvFile()` before accessing env vars
2. Check for errors in extension logs
3. Verify the path to `.env` is correct

## Alternative Methods

### 1. Shell Environment Variables

For temporary testing:
```bash
export KAGI_API_KEY=your_key
pi "search"
```

### 2. System-wide Environment Variables

Add to your shell config (not recommended for secrets):
```bash
# ~/.zshrc or ~/.bashrc
export KAGI_API_KEY=your_key
```

### 3. OS Keychain/Secrets Manager

Use your OS's secure storage:
- macOS: Keychain Access
- Linux: GNOME Keyring, KWallet
- Windows: Windows Credential Manager

Then access via command:
```bash
# macOS example
KAGI_API_KEY=$(security find-generic-password -wa kagi-api-key)
```

## Migration from Shell Config

If you previously added API keys to your shell config:

```bash
# 1. Add to .env file
echo 'KAGI_API_KEY=your_key' >> ~/.pi/agent/.env

# 2. Remove from shell config
# Edit ~/.zshrc or ~/.bashrc and remove the export line

# 3. Reload shell config
source ~/.zshrc

# 4. Verify it works
pi "search for something"
```

## Summary

| Method | Best For | Security | Persistence |
|--------|----------|----------|-------------|
| `~/.pi/agent/.env` | **Recommended** - All pi API keys | High | Yes |
| Shell `export` | Temporary testing | Medium | No (session only) |
| Shell config | Not recommended for secrets | Low | Yes |
| OS Keychain | Maximum security | Very High | Yes |

**Recommendation:** Use `~/.pi/agent/.env` for all pi-related API keys and secrets.