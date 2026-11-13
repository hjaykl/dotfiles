/**
 * Web Search Extension - Kagi API
 *
 * web_search runs `node lib/kagi-search.mjs` and returns its formatted
 * results as the tool's result.
 *
 * Setup:
 * 1. Get a Kagi API key from https://kagi.com/api/keys
 * 2. Add your API key to ~/.pi/agent/.env:  KAGI_API_KEY=your_api_key_here
 *
 * See ~/.pi/agent/API_KEYS_GUIDE.md for more information on managing API keys.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { renderCallText, renderCollapsibleResult } from "./lib/render.ts";

// Resolve the path to the standalone Kagi search script next to this file.
function resolveKagiScript(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return join(here, "lib", "kagi-search.mjs");
  } catch {
    return join(
      process.env.HOME || "~",
      ".pi",
      "agent",
      "extensions",
      "lib",
      "kagi-search.mjs",
    );
  }
}

function hasApiKey(): boolean {
  if (process.env.KAGI_API_KEY) return true;
  try {
    const envPath = join(process.env.HOME || "~", ".pi", "agent", ".env");
    return /(^|\n)\s*KAGI_API_KEY\s*=/.test(readFileSync(envPath, "utf-8"));
  } catch {
    return false;
  }
}

export default function webSearchKagi(pi: ExtensionAPI) {
  const KAGI_SCRIPT = resolveKagiScript();

  pi.on("session_start", async (_event, ctx) => {
    if (!existsSync(KAGI_SCRIPT)) {
      ctx.ui.notify(
        `Web Search (Kagi) loaded but search script not found at ${KAGI_SCRIPT}`,
        "warning",
      );
    } else if (!hasApiKey()) {
      ctx.ui.notify(
        "Web Search (Kagi) loaded but KAGI_API_KEY not set. Add it to ~/.pi/agent/.env",
        "warning",
      );
    } else {
      ctx.ui.notify(
        "Web Search (Kagi) loaded.",
        "info",
      );
    }
  });

  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web using Kagi Search API. Runs in the background; use wait_tool_call with the returned toolCallId to get results. Use this when you need current information, news, research, or facts from the internet.",
    promptSnippet: "Search the web for current information using web_search",
    promptGuidelines: [
      "Use web_search when the user asks for current information, news, or facts that require up-to-date web data.",
      "Use web_search when the user asks about recent events, latest developments, or time-sensitive topics.",
      "web_search runs in the background; call wait_tool_call with the returned toolCallId to retrieve results.",
      "Summarize search results clearly, highlighting the most relevant information.",
      "Cite sources when presenting information from search results.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "The search query string" }),
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
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      if (!hasApiKey()) {
        return {
          content: [
            {
              type: "text",
              text: [
                "Error: KAGI_API_KEY is not set.",
                "Add it to ~/.pi/agent/.env or export KAGI_API_KEY=your_api_key",
              ].join("\n"),
            },
          ],
          details: { error: "API key not configured" },
          isError: true,
        };
      }

      // Encode params as base64 JSON to avoid any quoting issues.
      const payload = Buffer.from(
        JSON.stringify({
          query: params.query,
          limit: params.limit,
          safe_search: params.safe_search,
          timerange: params.timerange,
        }),
      ).toString("base64");

      // Run the search script directly and return what it prints. (It used to
      // run in a background tmux tab; this setup has no tmux.)
      const { out, err, failed } = await new Promise<{ out: string; err: string; failed: boolean }>(
        (resolve) => {
          execFile(
            process.execPath,
            [KAGI_SCRIPT, payload],
            { timeout: 60_000, maxBuffer: 4 * 1024 * 1024, signal },
            (error, stdout, stderr) =>
              resolve({ out: String(stdout ?? ""), err: String(stderr ?? ""), failed: !!error }),
          );
        },
      );
      if (failed) {
        const msg = (err || out).trim() || "the Kagi search script failed";
        return {
          content: [{ type: "text", text: `Web search failed: ${msg}` }],
          details: { query: params.query, error: msg },
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: out.trimEnd() }],
        details: { query: params.query },
      };
    },

    // Collapsed by default; press ctrl-o (app.tools.expand) to see the full body.
    renderCall: renderCallText((a: { query: string }, t) =>
      t.fg("toolTitle", t.bold("Searching the web")) +
      t.fg("accent", ` — “${a.query}”`),
    ),
    renderResult: renderCollapsibleResult({
      partial: "Searching the web…",
      summary: (r) => {
        const q = (r.details as { query?: string } | undefined)?.query;
        return q ? `web search for “${q}”` : "web search";
      },
    }),
  });
}
