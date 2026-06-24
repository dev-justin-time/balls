# Puter Game Server — Going Balls Integration

> **Puter** is an open-source cloud desktop environment / platform that provides
> auth, persistent storage, real-time networking, and hosting for web applications.
> This guide covers self-hosting Puter as the game server backend for Going Balls.

---

## Overview

The Puter integration replaces the WebSimSocket dependency with a self-hostable,
open-source backend that users can run on their own infrastructure. This gives:

| Feature | Puter Service | Game Usage |
|---------|--------------|------------|
| **User Auth** | `puter.auth` | Sign-in, player identity, persistence |
| **Game State** | `puter.kv` | Save/load progress, leaderboards, track data |
| **File Storage** | `puter.fs` | Store custom tracks, skins, community content |
| **Multiplayer** | `puter.peer` | Real-time WebRTC multiplayer rooms |
| **App Hosting** | `puter.hosting` | Publish game updates to users |
| **AI Services** | `puter.ai` | Optional voice transcription, level generation |

---

## Quick Start: Self-Host Puter

### Prerequisites

- **Docker** with Compose plugin (`docker compose version`)
- **A domain** with DNS access (wildcard `*.your-domain.com` for subdomains)
- **Ports** 80 and 443 open on your firewall

### Option 1: One-Line Installer (Recommended)

```bash
curl -fsSL https://puter.com/selfhost | sh
```

This script:
1. Generates secrets and configuration
2. Downloads the `docker-compose.yml` for Puter
3. Starts the entire Puter stack via Docker Compose

### Option 2: Manual Docker Compose (Custom)

Copy the provided [`docker-compose.puter.yml`](./docker-compose.puter.yml) and customize:

```bash
# 1. Copy the compose file and env template
cp docker-compose.puter.yml puter-compose.yml
cp .env.example .env.puter

# 2. Edit .env.puter with your domain and secrets
nano .env.puter

# 3. Start Puter services
docker compose -f puter-compose.yml up -d
```

> **Note about nginx:** The Puter Docker image includes its own nginx configuration.
> The compose file does not mount a custom nginx.conf — Puter's built-in proxy handles
> routing automatically. If you need custom TLS settings, mount your certs to
> `./certs` directory and Puter will auto-detect them.

The Puter services will be available at:

| Service | URL |
|---------|-----|
| **Puter Dashboard** | `https://puter.your-domain.com` |
| **Puter API** | `https://api.puter.your-domain.com` |
| **Puter Apps** | `https://app.puter.your-domain.com` |

---

## Configure Going Balls to Use Puter

### 1. Set Environment Variables

Create or edit `.env` in the project root:

```env
# ── Puter Configuration ───────────────────────────────────────────
PUTER_API_ORIGIN=https://api.your-puter-domain.com
PUTER_APP_ID=going-balls-quad-core
PUTER_ENABLED=true
```

### 2. Initialize in the Game

The integration automatically detects Puter at startup. To verify it's working:

```js
import { initPuter, getGameServer, puterReady } from './src/puter_integration.js';

// During game bootstrap:
const puter = await initPuter({ apiOrigin: 'https://api.your-puter.com' });
const server = await getGameServer({ apiOrigin: 'https://api.your-puter.com' });

if (server) {
    const status = await server.healthCheck();
    console.log('Puter Game Server:', status);
}
```

### 3. Replace WebSimSocket Collections

The `src/networking.js` module is designed to fall back gracefully when
WebSimSocket is unavailable. When Puter is active, it becomes the primary
backend instead. The networking module now has a three-tier fallback:

```
WebSimSocket available? → YES → Use WebsimSocket (hosted on websim.com)
                         NO  → Puter available? → YES → Use Puter backend
                                                  NO  → Offline mode (localStorage only)
```

To enable Puter mode, ensure `PUTER_ENABLED=true` is set in your environment
or pass `apiOrigin` when calling `initPuter()` during game bootstrap.

---

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │              Browser (Game)              │
                    │  ┌───────────────────────────────────┐  │
                    │  │     puter_integration.js           │  │
                    │  │   ┌──────────┐  ┌──────────────┐  │  │
                    │  │   │ Auth     │  │ KV Store     │  │  │
                    │  │   │ (signIn) │  │ (progress,   │  │  │
                    │  │   └──────────┘  │  leaderboard) │  │  │
                    │  │                 └──────────────┘  │  │
                    │  │   ┌──────────┐  ┌──────────────┐  │  │
                    │  │   │ File Sys │  │ Peer Network │  │  │
                    │  │   │ (tracks) │  │ (multiplayer)│  │  │
                    │  │   └──────────┘  └──────────────┘  │  │
                    │  └───────────────────────────────────┘  │
                    └──────────┬──────────────────────────────┘
                               │
                    ┌──────────▼──────────────────────────────┐
                    │        Puter Backend (Self-Hosted)       │
                    │  ┌──────────┐  ┌──────────┐  ┌────────┐ │
                    │  │ Auth API │  │ KV Store │  │ File   │ │
                    │  │ (JWT)    │  │ (Dynamo) │  │ Store  │ │
                    │  └──────────┘  └──────────┘  └────────┘ │
                    │  ┌──────────┐  ┌──────────────────────┐  │
                    │  │ Peer     │  │ MariaDB / Valkey     │  │
                    │  │ (WebRTC) │  │ (Session/Cache)      │  │
                    │  └──────────┘  └──────────────────────┘  │
                    └──────────────────────────────────────────┘
```

---

## API Key Management

When self-hosting, you can manage API keys and app permissions
from the Puter dashboard at `https://puter.your-domain.com/settings`.

### Required Permissions for Going Balls

| Permission | Purpose |
|-----------|---------|
| `auth:user:read` | Get player identity |
| `kv:*` | Read/write game state |
| `fs:write` | Save community tracks |
| `fs:read` | Load community content |
| `peer:connect` | Multiplayer connections |

---

## Troubleshooting

| Problem | Likely Cause | Solution |
|---------|-------------|----------|
| `puter is not defined` | Not running in Puter ecosystem | Check `PUTER_API_ORIGIN` env var |
| KV operations return null | Auth token missing | Call `await server.signIn()` first |
| Peer connections fail | WebRTC ports blocked | Open UDP ports 49152-65535 |
| CORS errors | Origin not whitelisted | Add your domain to Puter dashboard |

---

## Resources

- **Puter GitHub**: https://github.com/HeyPuter/puter
- **Puter Docs**: https://docs.puter.com
- **Puter.js SDK**: https://www.npmjs.com/package/@heyputer/puter.js
- **Going Balls Integration**: `src/puter_integration.js`
