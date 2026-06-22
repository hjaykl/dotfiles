/**
 * Web Search Extension - Kagi API
 *
 * Adds web search capabilities to pi using the Kagi Search API.
 *
 * Setup:
 * 1. Get a Kagi API key from https://kagi.com/api/keys
 * 2. Add your API key to ~/.pi/agent/.env:
 *    KAGI_API_KEY=your_api_key_here
 * 3. Use the web_search tool or /kagi-search command
 *
 * Usage:
 * - Ask pi to search the web: "Search for latest TypeScript features"
 * - Use the /kagi-search command directly
 * - Configure search parameters in this file
 *
 * See ~/.pi/agent/API_KEYS_GUIDE.md for more information on managing API keys
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";

// Configuration
const CONFIG = {
  // Default search parameters (Kagi API v1)
  limit: 10, // Maximum number of results to return
  safeSearch: true, // Omit potentially NSFW content
};

// Kagi API v1 search endpoint (POST + Bearer auth + JSON body)
const SEARCH_URL = "https://kagi.com/api/v1/search";

// Map a coarse timerange ("day"/"week"/"month") to the v1 lens.time_relative
// filter. "year" isn't supported by time_relative, so it's left unset.
function timerangeToLens(timerange?: string): Record<string, unknown> | undefined {
  if (timerange === "day" || timerange === "week" || timerange === "month") {
    return { time_relative: timerange };
  }
  return undefined;
}

/**
 * Load environment variables from ~/.pi/agent/.env
 * This allows storing API keys without adding them to shell config
 */
function loadEnvFile(): Map<string, string> {
  const envVars = new Map<string, string>();
  
  try {
    const envPath = join(process.env.HOME || process.env.HOMEPATH || "~", ".pi", "agent", ".env");
    const content = readFileSync(envPath, "utf-8");
    
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith("#")) continue;
      
      // Parse KEY=VALUE
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        const value = trimmed.substring(eqIndex + 1).trim();
        
        // Remove quotes if present
        const cleanValue = value.replace(/^['"](.*)['"]$/, "$1");
        
        envVars.set(key, cleanValue);
        
        // Also set in process.env if not already set
        if (!process.env[key]) {
          process.env[key] = cleanValue;
        }
      }
    }
  } catch (error) {
    // .env file is optional - silently ignore if not found
    // Only log if we're in debug mode
    if (process.env.PI_DEBUG) {
      console.log("[web-search-kagi] Could not load .env file:", error);
    }
  }
  
  return envVars;
}

export default function webSearchKagi(pi: ExtensionAPI) {
  // Register the web search tool
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description: "Search the web using Kagi Search API. Use this when you need current information, news, research, or facts from the internet.",
    promptSnippet: "Search the web for current information using web_search",
    promptGuidelines: [
      "Use web_search when the user asks for current information, news, or facts that require up-to-date web data.",
      "Use web_search when the user asks about recent events, latest developments, or time-sensitive topics.",
      "Summarize search results clearly, highlighting the most relevant information.",
      "Cite sources when presenting information from search results.",
    ],
    parameters: Type.Object({
      query: Type.String({
        description: "The search query string",
      }),
      limit: Type.Optional(
        Type.Number({
          description: "Number of results to return (default: 10, max: 50)",
          minimum: 1,
          maximum: 50,
        }),
      ),
      safe_search: Type.Optional(
        Type.Boolean({
          description: "Whether to omit potentially NSFW content (default: true)",
        }),
      ),
      timerange: Type.Optional(
        Type.String({
          description: "Time range filter: 'day', 'week', 'month', or 'year'",
          enum: ["day", "week", "month", "year"],
        }),
      ),
    }),
    async execute(toolCallId, params, signal, onUpdate) {
      // Load env vars from .env file if not already set
      if (!process.env.KAGI_API_KEY) {
        loadEnvFile();
      }
      const apiKey = process.env.KAGI_API_KEY;
      
      if (!apiKey) {
        return {
          content: [
            {
              type: "text",
              text: "Error: KAGI_API_KEY environment variable is not set. Please set it with: export KAGI_API_KEY=your_api_key",
            },
          ],
          details: { error: "API key not configured" },
          isError: true,
        };
      }

      // Build the v1 request body
      const body: Record<string, unknown> = {
        query: params.query,
        limit: params.limit ?? CONFIG.limit,
        safe_search: params.safe_search ?? CONFIG.safeSearch,
      };

      const lens = timerangeToLens(params.timerange);
      if (lens) {
        body.lens = lens;
      }

      try {
        onUpdate?.({
          content: [{ type: "text", text: `Searching for: "${params.query}"...` }],
        });

        const response = await fetch(SEARCH_URL, {
          signal,
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return {
            content: [
              {
                type: "text",
                text: `Search failed with status ${response.status}: ${errorText}`,
              },
            ],
            details: { error: `HTTP ${response.status}` },
            isError: true,
          };
        }

        const data = await response.json();

        // Format the results (v1 nests web results under data.search)
        const results = data.data?.search ?? [];

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No results found for your search query.",
              },
            ],
            details: { resultCount: 0 },
          };
        }

        // Build formatted response
        let responseText = `Search results for "${params.query}":\n\n`;
        
        results.forEach((result: any, index: number) => {
          const title = result.title ?? "No title";
          const url = result.url ?? "No URL";
          const snippet = result.snippet ?? "No description available";
          const published = result.time ? ` (${result.time})` : "";

          responseText += `${index + 1}. **${title}**${published}\n`;
          responseText += `   URL: ${url}\n`;
          responseText += `   ${snippet}\n\n`;
        });

        // Add adjacent questions if available (v1's related-query results)
        const adjacent = data.data?.adjacent_question ?? [];
        if (adjacent.length > 0) {
          responseText += "\n**Related Questions:**\n";
          adjacent.forEach((item: any, i: number) => {
            const q = item.props?.question ?? item.title;
            if (q) responseText += `${i + 1}. ${q}\n`;
          });
        }

        return {
          content: [{ type: "text", text: responseText }],
          details: {
            resultCount: results.length,
            query: params.query,
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            {
              type: "text",
              text: `Search failed: ${errorMessage}`,
            },
          ],
          details: { error: errorMessage },
          isError: true,
        };
      }
    },
  });

  // Load env vars on extension startup
  loadEnvFile();

  // Register a command for direct search
  pi.registerCommand("kagi-search", {
    description: "Search the web using Kagi API",
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify("Please provide a search query. Usage: /kagi-search <query>", "error");
        return;
      }

      // Ensure env vars are loaded
      if (!process.env.KAGI_API_KEY) {
        loadEnvFile();
      }
      const apiKey = process.env.KAGI_API_KEY;
      if (!apiKey) {
        ctx.ui.notify("KAGI_API_KEY environment variable is not set", "error");
        return;
      }

      ctx.ui.notify("Searching...", "info");

      try {
        const response = await fetch(SEARCH_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            query: args,
            limit: CONFIG.limit,
            safe_search: CONFIG.safeSearch,
          }),
        });

        if (!response.ok) {
          ctx.ui.notify(`Search failed: ${response.status}`, "error");
          return;
        }

        const data = await response.json();
        const results = data.data?.search ?? [];

        if (results.length === 0) {
          ctx.ui.notify("No results found", "info");
          return;
        }

        // Display first few results
        let summary = `Found ${results.length} results for "${args}":\n\n`;
        results.slice(0, 5).forEach((result: any, index: number) => {
          summary += `${index + 1}. ${result.title ?? "No title"}\n`;
          summary += `   ${result.url ?? "No URL"}\n`;
          summary += `   ${result.snippet ?? ""}\n\n`;
        });

        ctx.ui.notify(summary, "info");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        ctx.ui.notify(`Search failed: ${errorMessage}`, "error");
      }
    },
  });

  // Notify user when extension loads
  pi.on("session_start", async (_event, ctx) => {
    // Ensure env vars are loaded
    if (!process.env.KAGI_API_KEY) {
      loadEnvFile();
    }
    
    const hasApiKey = !!process.env.KAGI_API_KEY;
    if (hasApiKey) {
      ctx.ui.notify("Web Search (Kagi) extension loaded - use web_search tool or /kagi-search command", "info");
    } else {
      ctx.ui.notify("Web Search (Kagi) extension loaded but KAGI_API_KEY not set. Add it to ~/.pi/agent/.env", "warning");
    }
  });
}