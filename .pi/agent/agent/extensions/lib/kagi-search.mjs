#!/usr/bin/env node
/**
 * kagi-search.mjs — standalone Kagi web search CLI.
 *
 * Designed to be run as a background "tool call" (see tool-runner.ts).
 * It performs the Kagi API call and prints formatted results to stdout, which
 * the tool-runner captures into the tool call's result.done file.
 *
 * Usage:
 *   node kagi-search.mjs <base64-json-params>
 *
 * params JSON: { query, limit?, safe_search?, timerange? }
 *
 * The KAGI_API_KEY is read from the environment, or from ~/.pi/agent/.env
 * (so the secret never needs to appear on the command line).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SEARCH_URL = "https://kagi.com/api/v1/search";

function loadEnvKey() {
  if (process.env.KAGI_API_KEY) return process.env.KAGI_API_KEY;
  try {
    const envPath = join(
      process.env.HOME || process.env.HOMEPATH || "~",
      ".pi",
      "agent",
      ".env",
    );
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (key !== "KAGI_API_KEY") continue;
      const val = trimmed.slice(eq + 1).trim().replace(/^['"](.*)['"]$/, "$1");
      return val;
    }
  } catch {
    // .env optional
  }
  return undefined;
}

function timerangeToLens(timerange) {
  if (timerange === "day" || timerange === "week" || timerange === "month") {
    return { time_relative: timerange };
  }
  return undefined;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Error: missing base64 params argument");
    process.exit(2);
  }

  let params;
  try {
    params = JSON.parse(Buffer.from(arg, "base64").toString("utf-8"));
  } catch (e) {
    console.error("Error: could not decode params:", e?.message ?? e);
    process.exit(2);
  }

  const apiKey = loadEnvKey();
  if (!apiKey) {
    console.error(
      "Error: KAGI_API_KEY is not set. Add it to ~/.pi/agent/.env or export it.",
    );
    process.exit(1);
  }

  const body = {
    query: params.query,
    limit: params.limit ?? 10,
    safe_search: params.safe_search ?? true,
  };
  const lens = timerangeToLens(params.timerange);
  if (lens) body.lens = lens;

  let data;
  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`Search failed with status ${res.status}: ${text}`);
      process.exit(1);
    }
    data = await res.json();
  } catch (e) {
    console.error("Search failed:", e?.message ?? e);
    process.exit(1);
  }

  const results = data.data?.search ?? [];
  if (results.length === 0) {
    console.log(`No results found for "${params.query}".`);
    return;
  }

  let out = `Search results for "${params.query}":\n\n`;
  results.forEach((r, i) => {
    const title = r.title ?? "No title";
    const url = r.url ?? "No URL";
    const snippet = r.snippet ?? "No description available";
    const published = r.time ? ` (${r.time})` : "";
    out += `${i + 1}. **${title}**${published}\n`;
    out += `   URL: ${url}\n`;
    out += `   ${snippet}\n\n`;
  });

  const adjacent = data.data?.adjacent_question ?? [];
  if (adjacent.length > 0) {
    out += "\n**Related Questions:**\n";
    adjacent.forEach((item, i) => {
      const q = item.props?.question ?? item.title;
      if (q) out += `${i + 1}. ${q}\n`;
    });
  }

  console.log(out.trimEnd());
}

main();
