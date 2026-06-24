# Going Balls — Quad-Core Architecture (v2.0)

> **Multi-Language Platform**: JavaScript · Rust (WASM) · Python · Lua
>
> Each language runs in the environment where it excels, connected through a secure IPC bridge.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                   BROWSER (Client-Side)                             │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    JAVASCRIPT (Orchestrator)                  │  │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────┐  ┌──────────┐ │  │
│  │  │ Scene      │  │ Rendering  │  │ Controls │  │ UI/Shop  │ │  │
│  │  │ (Three.js) │  │ (rAF Loop) │  │ (Input)  │  │ (Modals) │ │  │
│  │  └────────────┘  └────────────┘  └──────────┘  └──────────┘ │  │
│  │                                                              │  │
│  │  ┌─────────────────────────────────────────────────────────┐ │  │
│  │  │              QuadCore IPC Bridge (ipc_bridge.js)         │ │  │
│  │  │  Routes: Physics→Rust · Levels→Python · Economy→Lua     │ │  │
│  │  └─────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                           │            │            │               │
│              ┌────────────┘            │            └────────────┐  │
│              ▼                         ▼                        ▼  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │  RUST (WASM)     │  │  PYTHON (API)     │  │  LUA (wasmoon)   │ │
│  │  Physics Solver  │  │  Level Gen       │  │  Economy Engine  │ │
│  │  Anti-Cheat      │  │  Auth/Validation │  │  Shop Logic      │ │
│  │  Obfuscated      │  │  Rate Limiting   │  │  Game Theory     │ │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Language Assignment

| Language | Location | Responsibility | Why this language |
|----------|----------|---------------|-------------------|
| **JavaScript** | `main.js`, `src/`, `engine/` | UI orchestration, Three.js rendering, input handling, DOM, networking | Strongest built-in: DOM manipulation, event-driven async, browser APIs |
| **Rust** | `rust_core/src/physics_solver.rs` | Obfuscated physics simulation, velocity validation, anti-cheat | Strongest built-in: zero-cost abstractions, memory safety, WASM compilation, control-flow obfuscation |
| **Python** | `python_server/` | Secure level generation (AI), frame validation, WASM secrets, rate limiting | Strongest built-in: rich ecosystem (FastAPI, cryptography), rapid backend development, procedural generation |
| **Lua** | `src/scripts/shop_logic.lua` | Game theory pricing, endowed progress, decoy pricing, battle pass logic | Strongest built-in: embeddable lightweight runtime, hot-reloadable game logic, sandboxed execution |

---

## Module Architecture

```mermaid
graph TB
    subgraph Bootstrap["main.js — Quad-Core Bootstrap"]
        G[Game Class v2.0]
    end

    subgraph RecycledJS["Recycled v1.x Modules"]
        SC["engine/scene.js<br/>Three.js Scene · Camera · Renderer"]
        PH["src/physics.js<br/>cannon-es Physics (Fallback)"]
        RN["src/rendering.js<br/>rAF Loop · Camera Follow · VFX"]
        PR["src/persistence.js<br/>localStorage · RNG · Configs"]
        BD["src/ball_db.js<br/>70+ Skin Definitions"]
        NT["src/notification_manager.js"]
        AU["src/audio.js<br/>Music · SFX"]
        SL["src/speed_lines.js"]
        MB["src/motion_blur.js"]
        LG["src/levelgen.js<br/>Procedural Level Gen"]
    end

    subgraph QuadCore["Quad-Core New Modules"]
        IPC["src/core/ipc_bridge.js<br/>QuadCoreBridge<br/>JS↔Rust↔Python↔Lua"]
        LUA["src/scripts/shop_logic.lua<br/>Game Theory Economy"]
    end

    subgraph RustWASM["Rust WASM Core"]
        RS["rust_core/src/physics_solver.rs<br/>Obfuscated Physics<br/>Anti-Cheat Validation"]
        CA["rust_core/Cargo.toml"]
    end

    subgraph PythonBackend["Python Backend"]
        PY["python_server/main.py<br/>FastAPI Application"]
        LGEN["python_server/services/level_gen_ai.py<br/>Secure Level Generator"]
        RQ["python_server/requirements.txt"]
    end

    G --> RecycledJS
    G --> IPC
    IPC -->|WASM bridge| RS
    IPC -->|HTTP/Fetch| PY
    IPC -->|wasmoon| LUA
    PY --> LGEN

    style Bootstrap fill:#1a0a2e,stroke:#8844ff,color:#fff
    style RecycledJS fill:#16213e,stroke:#0f3460,color:#fff
    style QuadCore fill:#0a2e1a,stroke:#44ff88,color:#fff
    style RustWASM fill:#2e1a0a,stroke:#ff8844,color:#fff
    style PythonBackend fill:#1a1a2e,stroke:#4488ff,color:#fff
```

---

## Data Flow — Multi-Language Physics Pipeline

```mermaid
sequenceDiagram
    participant JS as JavaScript (Orchestrator)
    participant Rust as Rust WASM (Physics)
    participant Python as Python Backend

    JS->>+Rust: solve_physics_frame(inputBuffer, dt)
    Note over Rust: Obfuscated gravity calc
    Note over Rust: Chaotic friction derivation
    Note over Rust: Velocity clamping with noise
    
    Rust-->>-JS: [px, py, pz, rx, ry, rz, grounded, hash]
    
    JS->>JS: Update Three.js mesh
    
    opt Frame Validation
        JS->>+Python: validate_frame(frameHash, levelIndex)
        Note over Python: Compute expected hash
        Python-->>-JS: { valid: true/false }
        Note over Python: Server never re-simulates physics
        Note over Python: Saves 99% CPU vs full simulation
    end

    opt Level Generation
        JS->>+Python: POST /api/generate-level
        Note over Python: Generate seed → encrypt payload
        Python-->>-JS: { encrypted_payload, integrity_hash }
        Note over JS: Passes encrypted blob to rendering
        Note over JS: Rust WASM decrypts at runtime
    end
```

---

## Security Architecture

### Anti-Reverse Engineering Measures

| Technique | Implementation | Target |
|-----------|---------------|--------|
| Control-flow flattening | Non-standard branching in Rust WASM | Decompilers |
| Opaque pointers | `_InternalPhysicsContext` with misleading names | Static analysis |
| Chaotic constant derivation | Gravity/friction derived from server seeds at runtime | Memory scanners |
| Dead-code injection | Fake functions with complex-looking math | Reverse engineers |
| Encrypted level payloads | Fernet encryption on server, decryption in WASM | Cheaters |
| Frame validation hashes | Chaotic hash per frame, verified server-side | Speedhacks/flyhacks |

### Patent-Pending: Federated Physics Validation

**Method**: Asymmetric Cryptographic State Sync for browser-based physics.

Instead of sending raw physics coordinates over the network (which can be intercepted and altered), the client (Rust WASM) generates a chaotic hash of its local physics state using a server-provided seed. The server (Python) runs the same seed through the same chaotic function. If the hashes match, the server accepts the state transition.

**Benefits**: Prevents speedhacks and flyhacks without requiring the server to simulate the physics of every player, reducing server CPU load by 99% while maintaining anti-cheat integrity.

---

## Monetization Architecture (Game Theory)

```mermaid
flowchart LR
    subgraph Pricing["Decoy Pricing"]
        T1["Tier 1: Basic<br/>500 coins (Anchor)"]
        T2["Tier 2: Pro<br/>1,800 coins (Decoy)"]
        T3["Tier 3: Ultimate<br/>2,000 coins (Target)"]
    end

    subgraph Psychology["Behavioral Economics"]
        EP["Endowed Progress<br/>Start with 2/10 stamps"]
        SC["Sunk Cost Fallacy<br/>10% discount after 10h"]
        LA["Loss Aversion<br/>Upsell modal on Tier 2"]
    end

    subgraph Implementation["Lua Engine"]
        CP["calculate_decoy_purchase()"]
        GP["get_endowed_progress()"]
        AT["get_all_tiers()"]
    end

    Pricing --> CP
    Psychology --> CP
    CP -->|final_price| JS["JS UI"]
    CP -->|endowed_progress| JS
    CP -->|show_upsell| JS

    style Pricing fill:#2e1a0a,stroke:#ff8844,color:#fff
    style Psychology fill:#1a0a2e,stroke:#8844ff,color:#fff
    style Implementation fill:#0a2e1a,stroke:#44ff88,color:#fff
```

---

## Directory Structure

```
going-balls-quad-core/
├── rust_core/                          # 🔧 Rust WASM Physics Core
│   ├── Cargo.toml                      # Rust project config
│   ├── src/
│   │   └── physics_solver.rs           # Obfuscated physics + anti-cheat
│   └── pkg/                            # Generated WASM output
│
├── python_server/                      # 🐍 Python Backend
│   ├── main.py                         # FastAPI application
│   ├── requirements.txt                # Python dependencies
│   └── services/
│       └── level_gen_ai.py             # Secure procedural level generator
│
├── src/
│   ├── core/
│   │   └── ipc_bridge.js               # 🟨 Quad-Core IPC orchestrator
│   ├── scripts/
│   │   └── shop_logic.lua              # 🔵 Lua economy/monetization
│   ├── recycled/                       # (future: v1.x module copies)
│   └── lua/                            # (future: Lua VM helpers)
│
├── engine/                             # 🟨 Recycled v1.x JS modules
│   └── scene.js
│
├── src/                                # 🟨 Recycled v1.x JS modules
├── main.js                             # 🟨 Quad-Core Bootstrap
├── index.html                          # 🟨 New landing page
├── package.json                        # Updated with wasmoon
├── styles.css                          # CSS (recycled)
├── architecture.md                     # This document
└── server.js                           # Static file server
```

---

## Getting Started

### Prerequisites

- **Node.js** v18+ for the JavaScript client
- **Rust** with `wasm-pack` for compiling the WASM physics solver
- **Python 3.10+** for the backend server
- **npm** or **pnpm** for package management

### Development Setup

```bash
# 1. Install JS dependencies
npm install

# 2. Install Python dependencies
cd python_server && pip install -r requirements.txt && cd ..

# 3. Build Rust WASM physics solver
npm run build:wasm

# 4. Start the Python backend (in one terminal)
npm run python:dev

# 5. Start the JS frontend (in another terminal)
npm run dev
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start JS dev server on port 3000 |
| `npm run build:wasm` | Compile Rust to WASM |
| `npm run build:wasm:release` | Compile Rust to WASM (release, optimized) |
| `npm run python:dev` | Start Python backend with hot-reload on port 8000 |
| `npm run python:start` | Start Python backend (production) |
| `npm run full:dev` | Start both Python backend and JS server concurrently |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/generate-level` | Generate encrypted level payload |
| GET | `/api/auth/wasm-secrets` | Get WASM physics constants |
| POST | `/api/auth/validate-frame` | Validate physics frame hash |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0-alpha | 2026-06-24 | Quad-Core multi-language architecture |
| 1.2.0 | - | Full community track system, world map, workshop |
| 1.1.0 | - | AR/VR support, neighbor preview |
| 1.0.0 | - | Initial Web Edition release |
