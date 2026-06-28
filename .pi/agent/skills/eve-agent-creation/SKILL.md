---
name: eve-agent-creation
description: Configure a new eve agent's model and provider secret by pulling them from Dokploy's AI provider settings and writing them into the deployment environment (never into app code). Use when scaffolding or configuring an eve agent that will run alongside a Dokploy instance.
---

# Eve Agent Creation — model + secret from Dokploy

When creating an eve agent that lives next to a Dokploy instance, source the model
id and provider API key from Dokploy's already-configured **AI provider** instead of
asking the user to re-enter them. Pull them **once, at creation/configuration time**,
and write them into the agent's **deployment environment** (Dokploy env vars, or a
local `.env`). The agent's app code only ever reads `process.env`.

Do **not** call Dokploy's API from the agent's runtime/app code. It is a build/setup
step, not a runtime dependency.

## When to use

- Scaffolding a new eve agent (`agent/agent.ts` model config still a placeholder).
- The user runs Dokploy and has already added an AI provider under **Settings → AI**
  (e.g. a local vLLM / Ollama / OpenAI-compatible endpoint).
- You need the agent to use that same model + key.

## Step 1 — Pull the provider config from Dokploy

Dokploy exposes `ai.getAll`. Authenticate with an API key generated in
**Dokploy → Settings → API/Profile**.

```bash
curl -s -X GET "$DOKPLOY_URL/api/ai.getAll" \
  -H "x-api-key: $DOKPLOY_API_KEY"
```

- `DOKPLOY_URL` is the instance base. Dokploy's web UI/API commonly runs on port
  `3001` (e.g. `http://localhost:3001`), but confirm the user's port — it may sit
  behind a domain on 80/443.
- Generate the `x-api-key` token in Dokploy at **`/settings/profile` → API/CLI**.
  Non-admin users may need an admin to grant token access first.
- Response is a JSON array of providers. Confirmed schema (Dokploy, 2026):

  ```json
  [{
    "aiId": "IH7HTa4oK6TUkgK58KUtL",
    "name": "Spark vllm",
    "apiUrl": "http://host.docker.internal:8001/v1",
    "apiKey": "vllm",
    "model": "Intel/Qwen3.5-122B-A10B-int4-AutoRound",
    "isEnabled": true,
    "organizationId": "WLuyz4M2BBquihtkydMPu",
    "createdAt": "2026-06-28T01:08:29.414Z"
  }]
  ```

  Select the provider by `name` (the label the user gave it), and prefer ones with
  `isEnabled: true`. Parse out the three values you need: `apiUrl`, `apiKey`, `model`.

## Step 2 — Write them into the deployment environment (not app code)

Set these as environment variables on the agent's deployment. Pick the variable
names the agent will read, e.g.:

```
AI_BASE_URL=<apiUrl>
AI_MODEL=<model>
AI_API_KEY=<apiKey>
```

- **Deployed on Dokploy:** add them as Environment Variables on the eve app's
  service in Dokploy. This is the idiomatic way to inject config into a Dokploy app.
- **Running natively (e.g. `eve dev` on the Mac):** write them to the project `.env`
  (and confirm `.env` is gitignored). Never commit the key.

Keep the secret out of source, compiled artifacts, and chat logs.

## Step 3 — Wire `agent/agent.ts` to read the env

App code reads only `process.env` — no hardcoded values, no Dokploy call:

```ts
// agent/agent.ts
import { createOpenAI } from "@ai-sdk/openai";
import { defineAgent } from "eve";

const provider = createOpenAI({
  baseURL: process.env.AI_BASE_URL,
  apiKey: process.env.AI_API_KEY,
});

export default defineAgent({
  // Chat Completions, not the Responses API — see gotcha 2 below.
  model: provider.chat(process.env.AI_MODEL ?? ""),
  // Custom/unlisted model context window — see gotcha 1 below.
  modelContextWindowTokens: 131072,
});
```

Install the provider package if missing: `npm install @ai-sdk/openai`.

### Gotcha 1 — custom models need `modelContextWindowTokens`

eve's compaction needs the model's context-window size, which it looks up from the
AI Gateway catalog. A custom/unlisted model (vLLM, Ollama, etc.) has no catalog
entry, so the server **fails to boot** with:

> Cannot compile agent compaction because the primary compaction trigger model
> "…" does not have known AI Gateway context window metadata.

Fix: set `modelContextWindowTokens` on `defineAgent` to the model's real window.
For vLLM, read `max_model_len` from `GET <baseURL>/models` (e.g. `131072`).

### Gotcha 2 — use `.chat()`, not the default Responses API

Calling `provider(modelId)` from `@ai-sdk/openai` defaults to OpenAI's **Responses
API** (`POST /v1/responses`) and sends OpenAI-only fields like
`include: ['web_search_call.action.sources']`. vLLM's Responses endpoint rejects
those with `AI_APICallError … literal_error … 'web_search_call.action.sources'`
(HTTP 400). Use `provider.chat(modelId)` to hit `POST /v1/chat/completions`, which
vLLM and most OpenAI-compatible servers implement fully. (`@ai-sdk/openai-compatible`'s
`createOpenAICompatible` is an alternative that defaults to chat completions.)

Smoke-test the model after wiring: start `eve dev --no-ui`, `POST /eve/v1/session`
with a trivial message, attach to `GET /eve/v1/session/:id/stream`, and confirm a
`message.completed` event with real text (not `turn.failed` / `MODEL_CALL_FAILED`).

## Networking caveat (OrbStack / Docker on macOS)

If the inference server is on the LAN (e.g. `http://192.168.88.12:8000/v1`) and the
agent runs **inside a container** on macOS (OrbStack or Docker Desktop), the container
**cannot** reach LAN IPs — even with `--net=host` (OrbStack maps localhost only, not
the real macOS interface; confirmed in OrbStack issue #2408).

- If the eve agent runs **natively** on the Mac → use the direct LAN URL.
- If it runs **in a container** → point `AI_BASE_URL` at a host-side proxy reached
  through `host.docker.internal` (e.g. `http://host.docker.internal:8001/v1`), where a
  small proxy on the Mac forwards `127.0.0.1:8001 → 192.168.88.12:8000`. A launchd
  LaunchAgent keeps that proxy alive across reboots.

So when Dokploy's `apiUrl` is a raw LAN IP, translate it to the proxy URL before
writing `AI_BASE_URL` for a containerized agent.

## Checklist

- [ ] Pulled provider via `ai.getAll` with `x-api-key`.
- [ ] Selected the right provider by `name`.
- [ ] Wrote `AI_BASE_URL` / `AI_MODEL` / `AI_API_KEY` into Dokploy env vars or `.env`.
- [ ] `agent.ts` reads only `process.env`; no secrets or API calls in app code.
- [ ] `.env` is gitignored; secret never committed.
- [ ] LAN URL translated to the proxy URL if the agent runs in a container on macOS.
- [ ] Custom/unlisted model: `modelContextWindowTokens` set (else boot fails on compaction).
- [ ] OpenAI-compatible server (vLLM/Ollama): model wired with `provider.chat(...)`, not the Responses API.
- [ ] `npm exec -- tsc` (typecheck) passes.
- [ ] Smoke-tested a real turn end-to-end (`message.completed` with text, no `MODEL_CALL_FAILED`).
