/**
 * LM Studio Provider Extension
 *
 * Registers LM Studio as a model provider for pi, auto-detecting whatever
 * models are currently available on the local LM Studio server.
 *
 * Setup:
 * 1. Start LM Studio and enable its local server (Developer tab → Start Server).
 * 2. That's it — this extension queries the server on each pi launch and
 *    registers every non-embedding model it finds. Load/unload models in
 *    LM Studio and they appear/disappear in pi's /model list after a /reload.
 *
 * The server URL defaults to http://127.0.0.1:1234 and can be overridden with
 * the LMSTUDIO_BASE_URL environment variable.
 *
 * If LM Studio is not running, the extension quietly registers nothing so pi
 * still starts normally.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const BASE_URL = (process.env.LMSTUDIO_BASE_URL ?? "http://127.0.0.1:1234").replace(/\/+$/, "");

// LM Studio's native REST API exposes richer metadata than the OpenAI-compatible
// /v1/models endpoint (type, context length, capabilities).
interface NativeModel {
  id: string;
  type?: "llm" | "vlm" | "embeddings";
  max_context_length?: number;
  capabilities?: string[];
}

export default async function (pi: ExtensionAPI) {
  let models: NativeModel[];
  try {
    const res = await fetch(`${BASE_URL}/api/v0/models`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = (await res.json()) as { data: NativeModel[] };
    models = payload.data ?? [];
  } catch {
    // LM Studio not running / unreachable — register nothing and let pi start.
    return;
  }

  const chatModels = models.filter((m) => m.type !== "embeddings");
  if (chatModels.length === 0) return;

  pi.registerProvider("lmstudio", {
    name: "LM Studio",
    baseUrl: `${BASE_URL}/v1`,
    apiKey: "lmstudio", // placeholder — LM Studio ignores it, but pi needs a value
    api: "openai-completions",
    models: chatModels.map((m) => ({
      id: m.id,
      name: m.id,
      reasoning: false,
      input: m.type === "vlm" ? ["text", "image"] : ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.max_context_length ?? 131072,
      maxTokens: 16384,
      // Local OpenAI-compatible server: avoid the `developer` role and
      // reasoning_effort, which LM Studio backends generally don't accept.
      compat: {
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
      },
    })),
  });
}
