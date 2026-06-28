# Gitea GitOps Skill

<!-- description: Provides knowledge of the Gitea-based GitOps deployment system for the homelab -->

This skill provides knowledge of the Gitea-based GitOps deployment system. Use this when creating, configuring, or deploying applications through the homelab's GitOps workflow.

## System Overview

### Architecture

The homelab runs on a **Mac mini** with **OrbStack**, featuring:
- **Mac host**: Gitea (Git server + Actions), Portainer, Watchtower
- **Linux VM** (`deploy-host`): Dokploy PaaS with Docker Swarm + Traefik

### Service Endpoints

| Service | URL | Purpose |
|---------|-----|---------|
| Gitea | http://192.168.88.44:3000 | Git hosting + CI/CD |
| Gitea SSH | ssh://192.168.88.44:2222 | Git operations over SSH |
| Dokploy | http://192.168.88.44:3001 | PaaS dashboard |
| Deployed Apps | http://\<app\>.192.168.88.44.sslip.io | Live applications |

## Gitea Configuration

### Core Settings
- **Version**: Gitea 1.22
- **Database**: SQLite at `/data/gitea/gitea.db`
- **Domain**: 192.168.88.44
- **HTTP Port**: 3000
- **SSH Port**: 22 (internal), 2222 (host mapping)
- **LFS**: Enabled with JWT authentication
- **Offline Mode**: Enabled (LAN-only)

### Repository Settings
- **Push-to-create**: Enabled for both users and organizations
- **Root path**: `/data/git/repositories`
- **Local copy path**: `/data/gitea/tmp/local-repo`
- **Upload temp path**: `/data/gitea/uploads`

### Actions Configuration
- **Enabled**: Yes
- **Runner**: `macmini-runner` (native `act_runner` binary via launchd)
- **Artifacts path**: `/data/gitea/actions_artifacts`
- **Logs path**: `/data/gitea/actions_log`

### Runner Labels (CRITICAL)

The `act_runner` is registered with these labels — `runs-on:` MUST match one:

| Label | Execution | Use for |
|-------|-----------|---------|
| `macos-latest` | **host** (native macOS) | Node/Docker builds — Node 24 + OrbStack Docker live on the host |
| `ubuntu-latest` | docker (`node:24-alpine`) | AVOID — alpine has no `bash`, breaks `run:` steps (exit 127) |

**Always use `runs-on: macos-latest` for this homelab.** Host execution has
Node 24 (nvm) and Docker (OrbStack) directly available, so no `setup-node`
step is needed and `docker build` works natively.

Known failure modes:
- `Cannot find: node in PATH` → runner's launchd PATH is missing the nvm node bin
- `exec: "bash": executable file not found` → you're on the alpine container label; switch to `macos-latest`
- `no matching ... label` → `runs-on:` doesn't match a registered runner label

### Runner launchd PATH (host execution requirement)

For host execution to find Node AND `orb`, the launchd plist
`~/Library/LaunchAgents/com.gitea.runner.plist` MUST include both the nvm node
bin and Homebrew bin in its `PATH` env var:

```
/Users/jacob/.nvm/versions/node/v24.16.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/jacob/.orbstack/bin:/Users/jacob/.docker/bin
```

- `/Users/jacob/.nvm/.../bin` → `node`/`npm` (else: `Cannot find: node in PATH`)
- `/opt/homebrew/bin` → `orb` (else deploy step fails: `orb: command not found`)

After editing the plist, reload the runner:
```bash
launchctl unload -w ~/Library/LaunchAgents/com.gitea.runner.plist
sleep 2
launchctl load -w ~/Library/LaunchAgents/com.gitea.runner.plist
```

> Note: a running `act_runner` daemon keeps its registration in memory. Deleting
> `.runner` won't break the live daemon, but the next reload will fail with
> "registration file not found" — you must re-register (see below).

### Registering / Re-registering the Runner

The runner config lives at `/Users/jacob/homelab/data/runner/.runner`. To
re-register you need a fresh **registration token** (NOT a personal access
token, NOT the runner's own token). Fetch one via the API (POST):

```bash
# Repo-scoped registration token (also: /admin, /orgs/{org}, /user scopes)
curl -s -X POST \
  "http://192.168.88.44:3000/api/v1/repos/jacob/my-agent/actions/runners/registration-token" \
  -H "Authorization: token $GITEA_TOKEN"
# => {"token":"<REGISTRATION_TOKEN>"}
```

Then register with the correct labels:
```bash
cd /Users/jacob/homelab/data/runner
rm -f .runner
./act_runner register --no-interactive \
  --name "macmini-runner" \
  --instance "http://192.168.88.44:3000" \
  --token "<REGISTRATION_TOKEN>" \
  --labels "macos-latest:host,ubuntu-latest:docker://node:24-alpine"
# then reload the launchd service (see above)
```

The `:host` suffix in the registration label maps `macos-latest` to native host
execution. In the workflow you reference it as plain `runs-on: macos-latest`.

### Security
- **Install Lock**: Enabled
- **Reverse Proxy Limit**: 1
- **Internal Token**: JWT-based (stored in app.ini)
- **Password Hash**: PBKDF2

## Deployment Architecture (How apps actually go live)

**Critical:** Deployed apps do NOT run on the Mac. They run as **Docker Swarm
services on the `deploy-host` Linux VM**, routed by `dokploy-traefik` on
`:80/:443`. The Gitea runner lives on the Mac and reaches the VM's Docker via
the **`orb` CLI** — keyless, no SSH, no Dokploy API token required.

```
runner (Mac) --docker build--> image on Mac's OrbStack docker
   | docker save | orb -m deploy-host sudo docker load
   v
deploy-host VM docker  --> Swarm service `my-agent` on `dokploy-network`
   ^
   | routes http://my-agent:3000
dokploy-traefik (file provider) <- /etc/dokploy/traefik/dynamic/my-agent.yml
   |
   v  Host(`my-agent-192-168-88-44.sslip.io`)
LAN browser
```

### Key facts

- **Do NOT SSH to `192.168.88.44`** — that's the Mac (the runner host itself);
  Mac→Mac SSH fails with `Permission denied (publickey)`. Use `orb` to reach
  the VM instead.
- **Image transfer:** `docker save <img> | orb -m deploy-host sudo docker load`
  (single Swarm node, so a locally-loaded image is fine — the registry-digest
  warning is harmless).
- **Shared overlay network:** `dokploy-network` — services must attach to it so
  Traefik can reach them by service name.
- **Routing:** Traefik uses the **file provider**, not Docker labels. Dokploy
  (and our workflow) writes per-app YAML to
  `/etc/dokploy/traefik/dynamic/<app>.yml` mapping a `Host(...)` rule to
  `http://<service-name>:<port>`. Entry point is `web` (:80).
- **Hostname convention:** `<app>-192-168-88-44.sslip.io` (dashes, not dots, in
  the IP portion).

### Proven deploy step (orb-based, idempotent)

```bash
set -e
IMAGE=my-agent:$GITHUB_SHA
HOSTRULE=my-agent-192-168-88-44.sslip.io

# 1. Transfer image into the VM
docker save "$IMAGE" | orb -m deploy-host sudo docker load

# 2. Create or update the Swarm service on the dokploy network
if orb -m deploy-host sudo docker service inspect my-agent >/dev/null 2>&1; then
  orb -m deploy-host sudo docker service update --image "$IMAGE" --force my-agent
else
  orb -m deploy-host sudo docker service create \
    --name my-agent --network dokploy-network --env NODE_ENV=production "$IMAGE"
fi

# 3. Write the Traefik route (printf, not heredoc — avoids YAML indent issues)
printf 'http:\n  routers:\n    my-agent-router:\n      rule: Host(`%s`)\n      service: my-agent-service\n      entryPoints:\n        - web\n  services:\n    my-agent-service:\n      loadBalancer:\n        servers:\n          - url: http://my-agent:3000\n        passHostHeader: true\n' "$HOSTRULE" \
  | orb -m deploy-host sudo tee /etc/dokploy/traefik/dynamic/my-agent.yml >/dev/null
```

> `orb -m deploy-host sudo docker ...` works passwordlessly. The app port for a
> Next.js app is `3000` — match the `url: http://<service>:<port>` to your app.

## Dokploy API — fully scripted app creation (pure-CLI GitOps)

Dokploy has a **REST API** (tRPC via `@dokploy/trpc-openapi`) at
`http://192.168.88.44:3001/api/<router>.<procedure>` — **no official CLI**.
GET = queries (params flat in querystring, e.g. `?applicationId=...`; NOT
`?input=...`), POST = mutations (JSON body). Auth: **`x-api-key` header**.

**API key:** generated once in the Dokploy UI. The DB-stored `apikey.key` is a
better-auth **hash** (unusable); the `start` column is just the first 6 chars of
the real key. The working key is saved in `~/.env` as `DOKPLOY_API_KEY`
(`DOKPLOY_URL` too). Tip: a bad/unknown field returns a zodError listing the
exact required field names — use that to discover schemas.

### Data model
`project` → `environments[]` (a default `production` env is auto-created by
`project.create`) → `applications[]`. Apps attach to an **`environmentId`**, not
a projectId. Dokploy auto-generates the Swarm `appName` (e.g.
`app-hack-auxiliary-pixel-8wmizd`); a plain service name = NOT Dokploy-managed.

### Full create sequence (all POST, verified working)
```
project.create            {name, description}                 -> environment.environmentId
application.create        {name, description, environmentId}  -> applicationId
application.saveGiteaProvider {applicationId, giteaId, giteaOwner,
                              giteaRepository, giteaBranch,
                              giteaBuildPath:"/", watchPaths:[]}
application.saveBuildType {applicationId, buildType:"dockerfile",
                              dockerfile:"Dockerfile", dockerContextPath:"",
                              dockerBuildStage:"", herokuVersion:null,
                              railpackVersion:null}
application.update        {applicationId, autoDeploy:true}
domain.create             {applicationId, host, port, https:false, path:"/",
                              domainType:"application", certificateType:"none"}
application.deploy        {applicationId}
```
- **Connected Gitea provider id** to reuse for all repos: `giteaId = tAdzjNgpZdQ3U2Sxv5seZ` (owner `jacob`).
- Query an app: `GET /api/application.one?applicationId=...`; project tree: `GET /api/project.one?projectId=...`.

### Auto-deploy webhook (REQUIRED for API-created apps)
Unlike the UI flow, the API does **not** auto-register the Gitea webhook, so
`autoDeploy:true` alone won't fire on push. Register it manually:
- Webhook receiver: `http://192.168.88.44:3001/api/deploy/<refreshToken>`
  (get `refreshToken` from `application.one`).
- Create a Gitea push hook pointing at it:
```bash
curl -X POST "$GITEA_URL/api/v1/repos/jacob/<app>/hooks" \
  -H "Authorization: token $GITEA_TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"gitea","active":true,"events":["push"],"config":{"url":"http://192.168.88.44:3001/api/deploy/<refreshToken>","content_type":"json"}}'
```

### One-command bootstrap
`/Users/jacob/homelab/scripts/new-app.sh <app-name> [port] [branch]` does the
whole thing: Gitea push-to-create → the full Dokploy create sequence → webhook
→ first deploy. After that, **everyday deploys are pure `git push`** (Gitea
webhook → Dokploy build+deploy). Requires `~/.env` (`DOKPLOY_URL`,
`DOKPLOY_API_KEY`, `GITEA_URL`, `GITEA_TOKEN`) and a `Dockerfile` in the repo.

```bash
source ~/.env
cd /path/to/project          # must contain a Dockerfile
new-app.sh my-thing 3000 main
```

### Can a new project deploy "purely with git"?
- **Repo creation:** yes — Gitea push-to-create.
- **First Dokploy app registration:** no native git trigger — needs the one-time
  bootstrap above (`new-app.sh`, ~5s of API calls). Dokploy has no
  "discover repo → create app" feature.
- **Every push after that:** yes — pure `git push` auto-deploys via the webhook.

## Dokploy-managed (UI alternative)

The orb-based path above works but is **invisible to the Dokploy dashboard**
because Dokploy only tracks apps in its own Postgres DB. A raw Swarm service
created via `orb` has a plain name (e.g. `my-agent`); Dokploy-created services
get a random suffix (e.g. `my-agent-utmbkc`). If "see it in Dokploy" matters,
use the managed path instead:

**Setup is a few clicks in the Dokploy UI** (http://192.168.88.44:3001) — the
Dokploy API requires an `x-api-key`, and the stored key is hashed by better-auth
(the `apikey.key` column is NOT a usable plaintext key), so there's no clean
fully-CLI shortcut. Gitea is already connected as a git provider.

1. Project → **Create Application** → name `my-agent`
2. **Source → Gitea** → repo `jacob/my-agent`, branch `main`
3. **Build Type → Dockerfile** (uses the repo's `Dockerfile`)
4. **Domain** → `my-agent-192-168-88-44.sslip.io`, container port `3000`, entry `web`
5. Enable **Auto Deploy** (Dokploy creates the Gitea webhook itself) → **Deploy**

With Auto Deploy on, `git push` → Gitea webhook → Dokploy builds the Dockerfile
and redeploys. Dokploy owns the Swarm service, Traefik route, domain, TLS, env
vars, logs and rollbacks. **The Gitea Actions workflow should then be CI-only**
(typecheck/build) — do NOT also build/push Docker or deploy via orb, or you'll
build the image twice per push and fight Dokploy over the Traefik route/domain.

**Cleanup if migrating from orb → Dokploy:** remove the hand-rolled resources
first so they don't collide with Dokploy's domain/route:
```bash
orb -m deploy-host sudo docker service rm my-agent
orb -m deploy-host sudo rm -f /etc/dokploy/traefik/dynamic/my-agent.yml
```

**Inspecting Dokploy state** (read-only, via Postgres over orb):
```bash
PG() { orb -m deploy-host sudo docker exec \
  $(orb -m deploy-host sudo docker ps -q -f name=dokploy-postgres) \
  psql -U dokploy -d dokploy "$@"; }
PG -c "SELECT name, \"appName\", \"sourceType\" FROM application;"
```

## GitOps Workflow

### Standard Deployment Flow

```bash
# 1. Create and initialize your project
cd /path/to/project
git init
git add .
git commit -m "Initial commit"

# 2. Add Gitea remote (push-to-create)
git remote add origin ssh://jacob@192.168.88.44:2222/jacob/my-agent.git

# 3. Push to create repo and trigger deployment
git push -u origin main
```

That's it! The workflow will:
1. Create the repository automatically
2. Run Gitea Actions CI/CD
3. Build Docker image
4. Push to registry
5. Deploy to Dokploy
6. Serve via Traefik at `my-agent.192.168.88.44.sslip.io`

### Complete End-to-End Example

```bash
# Step 1: Create project structure
mkdir my-agent
cd my-agent
cat > Dockerfile << 'EOF'
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
EOF

cat > package.json << 'EOF'
{
  "name": "my-agent",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  }
}
EOF

cat > server.js << 'EOF'
const http = require('http');
const port = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Hello from my-agent!');
}).listen(port);

console.log(`Server running on port ${port}`);
EOF

# Step 2: Create Gitea Actions workflow
mkdir -p .gitea/workflows
cat > .gitea/workflows/deploy.yml << 'EOF'
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker Image
        run: |
          docker build -t ${{ secrets.DOCKER_USERNAME }}/my-agent:${{ github.sha }} .
          docker tag ${{ secrets.DOCKER_USERNAME }}/my-agent:${{ github.sha }} ${{ secrets.DOCKER_USERNAME }}/my-agent:latest

      - name: Login to Docker Registry
        run: |
          echo "${{ secrets.DOCKER_PASSWORD }}" | docker login -u "${{ secrets.DOCKER_USERNAME }}" --password-stdin

      - name: Push to Registry
        run: |
          docker push ${{ secrets.DOCKER_USERNAME }}/my-agent:${{ github.sha }}
          docker push ${{ secrets.DOCKER_USERNAME }}/my-agent:latest

      - name: Deploy to Dokploy
        run: |
          echo "Deployment complete!"
          echo "Access your app at: http://my-agent.192.168.88.44.sslip.io"
EOF

# Step 3: Initialize git and push
git init
git add .
git commit -m "Initial commit with Docker deployment"

# Step 4: Add Gitea remote (push-to-create)
git remote add origin ssh://jacob@192.168.88.44:2222/jacob/my-agent.git

# Step 5: Push to trigger deployment
git push -u origin main

# Step 6: Add secrets (run once, can be scripted)
export GITEA_TOKEN="your-gitea-personal-access-token"
export DOCKER_USERNAME="your-docker-username"
export DOCKER_PASSWORD="your-docker-access-token"

curl -X POST "http://192.168.88.44:3000/api/v1/repos/jacob/my-agent/actions/secrets" \
  -H "Authorization: token $GITEA_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"secret_name\": \"DOCKER_USERNAME\", \"value\": \"$DOCKER_USERNAME\"}"

curl -X POST "http://192.168.88.44:3000/api/v1/repos/jacob/my-agent/actions/secrets" \
  -H "Authorization: token $GITEA_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"secret_name\": \"DOCKER_PASSWORD\", \"value\": \"$DOCKER_PASSWORD\"}"
```

### One-Command Deployment Script

Create a deployment script for repeatable deployments:

```bash
#!/bin/bash
# deploy.sh - Deploy a project to Gitea GitOps

set -e

PROJECT_NAME=${1:-my-agent}
BRANCH=${2:-main}

echo "🚀 Deploying $PROJECT_NAME to Gitea..."

# Initialize git if needed
if [ ! -d ".git" ]; then
  git init
  git add .
  git commit -m "Deploy $PROJECT_NAME"
fi

# Add remote (push-to-create)
git remote remove origin 2>/dev/null || true
git remote add origin ssh://jacob@192.168.88.44:2222/jacob/${PROJECT_NAME}.git

# Push to trigger deployment
git push -u origin $BRANCH

echo "✅ Pushed to Gitea!"
echo "📊 Monitor at: http://192.168.88.44:3000/jacob/${PROJECT_NAME}/actions"
echo "🌐 App will be available at: http://${PROJECT_NAME}.192.168.88.44.sslip.io"
```

Usage:
```bash
chmod +x deploy.sh
./deploy.sh my-agent
```

### Push-to-Create Repositories

Gitea supports automatic repository creation on first push:

```bash
# Create new repo by pushing (auto-creates if doesn't exist)
git remote add origin ssh://jacob@192.168.88.44:2222/jacob/new-repo.git
git push -u origin main
```

This creates:
- Repository at `/data/git/repositories/jacob/new-repo.git`
- Web UI at http://192.168.88.44:3000/jacob/new-repo

## Creating Gitea Actions Workflows

### Basic Workflow Structure

Workflows go in `.gitea/workflows/` directory (Gitea-specific, not `.github/workflows/`).

```yaml
name: Deploy Application

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: macos-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Build Docker Image
        run: |
          docker build -t myapp:${{ github.sha }} .

      - name: Deploy
        run: |
          # Deployment logic here
          echo "Deploying..."
```

### Common Workflow Templates

#### Docker Build & Push

```yaml
name: Build Docker Image

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build and Tag
        run: |
          docker build -t myapp:latest .
          docker tag myapp:latest myapp:${{ github.sha }}

      - name: Push to Docker Registry
        run: |
          echo "${{ secrets.DOCKER_PASSWORD }}" | docker login -u "${{ secrets.DOCKER_USERNAME }}" --password-stdin
          docker push myapp:latest
```

#### Deploy to Dokploy

```yaml
name: Deploy to Dokploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy via Dokploy API
        run: |
          curl -X POST http://192.168.88.44:3001/api/deploy/${{ secrets.DOKPLOY_PROJECT_ID }} \
            -H "Authorization: Bearer ${{ secrets.DOKPLOY_TOKEN }}"
```

#### Health Check Workflow

```yaml
name: System Health Check

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:

jobs:
  health-check:
    runs-on: macos-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Check Docker Status
        run: |
          docker ps -a

      - name: Check Container Health
        run: |
          docker-compose ps

      - name: Check Disk Space
        run: |
          df -h /

      - name: Check Gitea Status
        run: |
          curl -f http://localhost:3000/api/v1/version
```

## Secrets Management

### Available Secrets

Store secrets in Gitea repository settings → Secrets:

| Secret | Purpose |
|--------|---------|
| `DOCKER_USERNAME` | Docker registry username |
| `DOCKER_PASSWORD` | Docker registry password |
| `DOKPLOY_TOKEN` | Dokploy API access token |
| `DEPLOY_KEY` | SSH key for deployment |
| `KAGI_API_KEY` | Kagi search API key |

### Accessing Secrets in Workflows

```yaml
steps:
  - name: Use Secret
    run: |
      echo "Using ${{ secrets.MY_SECRET }}"
```

### Adding Secrets via CLI/API

Secrets can be added programmatically using the Gitea API:

```bash
# Add a secret to a repository
curl -X POST http://192.168.88.44:3000/api/v1/repos/jacob/my-agent/actions/secrets \
  -H "Authorization: token YOUR_GITEA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "secret_name": "DOCKER_USERNAME",
    "value": "your-docker-username"
  }'

# Add Docker password secret
curl -X POST http://192.168.88.44:3000/api/v1/repos/jacob/my-agent/actions/secrets \
  -H "Authorization: token YOUR_GITEA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "secret_name": "DOCKER_PASSWORD",
    "value": "your-docker-access-token"
  }'
```

### Getting a Gitea Personal Access Token

1. Go to: http://192.168.88.44:3000/user/settings/applications
2. Click "Generate New Token"
3. Give it a name (e.g., "CI/CD Bot")
4. Select scopes: `write:repository`, `read:repository`, `write:actions`
5. Copy the token - store it securely!

### Environment Variables for Scripting

```bash
export GITEA_TOKEN="your-gitea-token"
export GITEA_URL="http://192.168.88.44:3000"
export DOCKER_USERNAME="your-docker-username"
export DOCKER_PASSWORD="your-docker-token"

# Add secret
add_secret() {
  local name=$1
  local value=$2
  curl -X POST "$GITEA_URL/api/v1/repos/jacob/my-agent/actions/secrets" \
    -H "Authorization: token $GITEA_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"secret_name\": \"$name\", \"value\": \"$value\"}"
}

add_secret "DOCKER_USERNAME" "$DOCKER_USERNAME"
add_secret "DOCKER_PASSWORD" "$DOCKER_PASSWORD"
```

## Common Operations

### Repository Setup

```bash
# Initialize new repo
git init
git remote add origin ssh://jacob@192.168.88.44:2222/jacob/my-repo.git
git push -u origin main

# Or via HTTPS
git remote add origin http://192.168.88.44:3000/jacob/my-repo.git
```

### Runner Management

```bash
# Check runner status
launchctl list | grep gitea

# View runner logs
log show --predicate 'process == "gitea-runner"' --last 1h

# Restart runner
sudo launchctl stop homebrew.mxcl.gitea-runner
sudo launchctl start homebrew.mxcl.gitea-runner
```

### Docker Operations

```bash
# Host services (Mac)
docker compose up -d
docker compose ps

# VM services (Dokploy on Linux VM)
orb -m deploy-host sudo docker service ls
orb -m deploy-host sudo docker service logs <service-name>
```

### Gitea API Examples

```bash
# Get version
curl http://192.168.88.44:3000/api/v1/version

# List repos
curl http://192.168.88.44:3000/api/v1/user/repos

# Create repo (requires auth token)
curl -X POST http://192.168.88.44:3000/api/v1/user/repos \
  -H "Authorization: token YOUR_TOKEN" \
  -d '{"name": "new-repo", "private": false}'
```

## Troubleshooting

### Runner Not Working

```bash
# Check if runner is running
launchctl list | grep gitea

# Check logs
tail -f /Users/jacob/homelab/data/gitea/log/gitea.log

# Restart runner
sudo launchctl stop homebrew.mxcl.gitea-runner
sudo launchctl start homebrew.mxcl.gitea-runner
```

### Deployment Failing

```bash
# Check Gitea Actions logs
# Navigate to: http://192.168.88.44:3000/jacob/repo/actions

# Check Dokploy logs
orb -m deploy-host sudo docker service logs dokploy

# Check container health
docker-compose ps
```

### Network Issues

```bash
# Verify Gitea is accessible
curl http://192.168.88.44:3000

# Check Docker network
docker network ls
docker inspect homelab_homelab

# Test VM connectivity
orb -m deploy-host ping -c 3 192.168.88.44
```

## File Locations

| Component | Path |
|-----------|------|
| Gitea config | `/Users/jacob/homelab/data/gitea/gitea/conf/app.ini` |
| Gitea database | `/Users/jacob/homelab/data/gitea/gitea/gitea.db` |
| Git repositories | `/Users/jacob/homelab/data/gitea/git/repositories/` |
| Actions artifacts | `/Users/jacob/homelab/data/gitea/actions_artifacts/` |
| Actions logs | `/Users/jacob/homelab/data/gitea/actions_log/` |
| Docker compose | `/Users/jacob/homelab/docker-compose.yml` |
| Homelab repo | `/Users/jacob/homelab/` |

## Best Practices

1. **Never commit secrets** - Use Gitea secrets management
2. **Use workflow_dispatch** for manual triggers during development
3. **Test workflows** with small changes before production deployments
4. **Monitor runner health** regularly
5. **Keep Docker images small** - use multi-stage builds
6. **Tag images with commit SHA** for traceability
7. **Use sslip.io** for easy DNS-free subdomains on LAN
8. **Add secrets before first push** - Use the helper script below

### Quick Start: Deploy a New App

```bash
# 1. Create your project
cd /path/to/your-app

# 2. Add Dockerfile and .gitea/workflows/deploy.yml
# (see workflow templates above)

# 3. Initialize git
git init
git add .
git commit -m "Initial commit"

# 4. Add Gitea remote (push-to-create)
git remote add origin ssh://jacob@192.168.88.44:2222/jacob/your-app-name.git

# 5. Set up secrets (run once)
export GITEA_TOKEN="your-gitea-token"
export DOCKER_USERNAME="your-docker-username"
export DOCKER_PASSWORD="your-docker-token"
/Users/jacob/homelab/scripts/add-gitea-secrets.sh your-app-name

# 6. Push to deploy!
git push -u origin main

# 7. Your app will be live at:
# http://your-app-name.192.168.88.44.sslip.io
```

## Related Documentation

- `/Users/jacob/homelab/ARCHITECTURE.md` - System architecture
- `/Users/jacob/homelab/README.md` - Quick reference
- `/Users/jacob/homelab/.gitea/workflows/healthcheck.yml` - Example workflow
- `/Users/jacob/homelab/docker-compose.yml` - Service configuration