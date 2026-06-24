# Going Balls — Architecture Diagrams

> Render these in any Mermaid-compatible viewer (GitHub, GitLab, VS Code, Mermaid Live Editor).

---

## 1. High-Level Module Architecture

```mermaid
graph TB
    subgraph Bootstrap["main.js — DI Bootstrap"]
        G[Game Class]
    end

    subgraph Core["Core Engine"]
        SC["engine/scene.js<br/>Three.js Scene · Camera · Renderer<br/>Materials · Sky/PMREM · Ball Skin"]
        PH["src/physics.js<br/>cannon-es World · Ball Body<br/>Forces · Collisions · Weather Particles"]
        LG["src/levelgen.js<br/>Procedural Level Gen<br/>40+ Segment Types · 9 Tiers"]
        RN["src/rendering.js<br/>rAF Loop · Camera Follow<br/>Speed Lines · Motion Blur"]
    end

    subgraph Data["Data & Persistence"]
        PR["src/persistence.js<br/>localStorage · mulberry32 RNG<br/>Sky/Powerup Configs · Weather AI"]
        BD["src/ball_db.js<br/>65+ Skin Definitions<br/>Single Source of Truth"]
        NT["src/notification_manager.js<br/>Toast Pool · Rate Limiting"]
    end

    subgraph AudioNet["Audio & Networking"]
        AU["src/audio.js<br/>Music · SFX Pool<br/>AudioContext Visualizer"]
        NW["src/networking.js<br/>WebsimSocket · Loading Manager<br/>Error Handlers"]
    end

    subgraph UI["User Interface"]
        UI_[src/ui.js<br/>Shop · Leaderboard · Ball Index<br/>Settings · Game State]
        BI["src/ball_index_ui.js<br/>Remote Stats Merge<br/>Equip/Buy/Level"]
    end

    subgraph VFX["Visual Effects"]
        SL["src/speed_lines.js<br/>64 LineSegments<br/>Velocity-linked opacity"]
        MB["src/motion_blur.js<br/>Two-pass directional blur<br/>Shader-based composite"]
    end

    subgraph Builder["Track Builder"]
        BC["catalog.js<br/>25+ Part Definitions<br/>5 Categories"]
        BS["builder_scene.js<br/>3D Builder Scene<br/>Grid · Placement"]
        BU["builder_ui.js<br/>Categorized Grid<br/>XP Bar · Actions"]
        BN["builder_networking.js<br/>Multiplayer Sync<br/>Community · Likes/Ratings"]
        BX["builder_xp.js<br/>XP & Leveling<br/>9 Rank Titles"]
    end

    subgraph Workshop["3D Workshop"]
        WA["ws_app.js — Entry Point"]
        WS["ws_scene.js · ws_controls.js<br/>ws_state.js · ws_selection.js"]
        WP["ws_painter.js · ws_sculpting.js<br/>ws_rigging.js · ws_wireframeEditor.js"]
        WE["ws_exporter.js · ws_loaders.js<br/>ws_gallery.js · ws_agent.js"]
    end

    subgraph World["World Grid"]
        WST["world_state.js<br/>WorldGrid · Sites<br/>Terrain Presets"]
        WNW["world_networking.js<br/>Real-time Sync<br/>Presence · Ownership"]
        WUI["world_ui.js<br/>Grid View<br/>Site Cards"]
        MP["marketplace.js<br/>Buy/Sell Sites<br/>Blueprints · History"]
        WM["world_minimap.js<br/>Neighbor Preview<br/>3D Thumbnail"]
        WAR["world_arvr.js<br/>AR/VR Pointers"]
    end

    G --> SC
    G --> PH
    G --> LG
    G --> RN
    G --> PR
    G --> AU
    G --> NW
    G --> UI_
    G --> BI
    G --> NT
    G --> SL
    G --> MB
    G --> BC
    G --> BS
    G --> BU
    G --> BN
    G --> BX
    G --> WA
    WA --> WS
    WA --> WP
    WA --> WE
    G --> WST
    G --> WNW
    G --> WUI
    G --> MP
    G --> WM
    G --> WAR

    SC -->|scene, camera, renderer| PH
    SC -->|materials, sky| LG
    PH -->|ballBody, collisions| LG
    PR -->|rng, configs| LG
    PR -->|ballConfigs| BD
    NW -->|room| BN
    NW -->|room| WNW
    RN -->|updateMotionBlur| MB
    RN -->|updateSpeedLines| SL

    style Bootstrap fill:#1a1a2e,stroke:#e94560,color:#fff
    style Core fill:#16213e,stroke:#0f3460,color:#fff
    style Data fill:#1a1a2e,stroke:#533483,color:#fff
    style AudioNet fill:#1a1a2e,stroke:#e94560,color:#fff
    style UI fill:#16213e,stroke:#0f3460,color:#fff
    style VFX fill:#1a1a2e,stroke:#533483,color:#fff
    style Builder fill:#0f3460,stroke:#e94560,color:#fff
    style Workshop fill:#533483,stroke:#e94560,color:#fff
    style World fill:#16213e,stroke:#0f3460,color:#fff
```

---

## 2. Game Loop (Per Frame)

```mermaid
flowchart TD
    A[requestAnimationFrame] --> B{Builder Active?}
    B -->|Yes| C[Render Builder Scene]
    B -->|No| D{World Active?}
    D -->|Yes| E[Render World Scene]
    D -->|No| F[updatePhysics dt]
    F --> G[updateCamera dt]
    G --> H[updateSpeedLines dt]
    H --> I[updateMotionBlur]
    I --> J[Update Weather Particles]
    J --> K{Infinite Mode?}
    K -->|Yes| L[spawnInfiniteChunk]
    K -->|No| M[renderer.render scene, camera]
    L --> M
    M --> N[finishMotionBlur]
    N --> O[Render Music Visualizer]
    O --> A

    C --> A
    E --> A

    style A fill:#e94560,color:#fff
    style F fill:#0f3460,color:#fff
    style M fill:#533483,color:#fff
```

---

## 3. Data Flow — Ball State

```mermaid
flowchart LR
    subgraph Input
        K[WASD / Arrows]
        M[Mouse Drag]
        J[nipplejs Joystick]
    end

    subgraph Physics["cannon-es"]
        W[World.step]
        B[Ball Body<br/>Sphere r=0.5, mass=100]
    end

    subgraph Forces
        SF[Steer Force<br/>STEER_SPEED=22]
        GF[Gravity<br/>GRAVITY=-45]
        LF[Linear Damping<br/>0.5]
        AD[Angular Damping<br/>0.95]
        SP[Speed Mult<br/>Skin Abilities]
    end

    subgraph Ball
        BV[velocity: Vec3]
        BP[position: Vec3]
        BR[quaternion: Quat]
    end

    subgraph Rendering
        BM[ballMesh.position.copy]
        BR_[ballMesh.quaternion.copy]
    end

    K --> SF
    M --> SF
    J --> SF
    SF --> W
    GF --> W
    LF --> W
    AD --> W
    SP --> W
    W --> BV
    W --> BP
    W --> BR
    BV --> BM
    BP --> BM
    BR --> BR_

    style Physics fill:#0f3460,color:#fff
    style Ball fill:#e94560,color:#fff
    style Rendering fill:#533483,color:#fff
```

---

## 4. Level Generation Pipeline

```mermaid
flowchart TD
    A[createLevel game, seed] --> B[Initialize mulberry32 RNG]
    B --> C[Select Difficulty Tier<br/>9 tiers: EASY → IMPOSSIBLE]
    C --> D[Calculate numSegments<br/>15 + floor level × 2.5]
    D --> E[Loop: Generate Segments]
    E --> F{Pick Segment Type<br/>from tier pool}
    F --> G[Straight / Ramp / Zigzag]
    F --> H[Pendulum / Spinner / Hammer]
    F --> I[Tunnel / Archipelago / Checkerboard]
    F --> J[Glass / Loop / Spiral / Curve]
    F --> K[Spring Pad / Portal / Half Pipe]
    G --> L[placeSegment x, y, z]
    H --> L
    I --> L
    J --> L
    K --> L
    L --> M[addCoins along path]
    M --> N{Even Level?}
    N -->|Yes| O[Mirror Horizontally]
    N -->|No| P[Continue]
    O --> P
    P --> Q{More Segments?}
    Q -->|Yes| E
    Q -->|No| R[Insert Checkpoints]
    R --> S[Place Finish Gate]
    S --> T[Spawn Weather Particles]

    style A fill:#e94560,color:#fff
    style F fill:#0f3460,color:#fff
    style T fill:#533483,color:#fff
```

---

## 5. Multiplayer Architecture

```mermaid
flowchart TD
    subgraph Client["Browser Client"]
        NW_[networking.js]
        BR_[builder_networking.js]
        WR_[world_networking.js]
    end

    subgraph WebsimSocket
        ROOM[WebsimSocket Room]
    end

    subgraph Collections["Room Collections"]
        LB[leaderboard<br/>Level, Time, Coins, Score]
        BS_[ball_stats<br/>ballKey, avgTime, bestTime]
        BT[builder_track<br/>Part placements, cursors]
        ST[shared_tracks<br/>Name, Parts, Author, Likes]
        TL[track_likes<br/>trackId, playerId]
        TR[track_ratings<br/>trackId, rating 1-5]
        TP[track_plays<br/>trackId, playedAt]
        WS_[world_sites<br/>col, row, ownerId, terrain]
        WP_[world_parts<br/>siteKey, partKey, position]
        WPR[world_presence<br/>playerId, siteCol, siteRow]
        WL[world_listings<br/>siteKey, price, sellerId]
    end

    NW_ -->|initialize| ROOM
    BR_ -->|subscribe| ROOM
    WR_ -->|subscribe| ROOM
    ROOM --> LB
    ROOM --> BS_
    ROOM --> BT
    ROOM --> ST
    ROOM --> TL
    ROOM --> TR
    ROOM --> TP
    ROOM --> WS_
    ROOM --> WP_
    ROOM --> WPR
    ROOM --> WL

    style Client fill:#0f3460,color:#fff
    style WebsimSocket fill:#e94560,color:#fff
    style Collections fill:#1a1a2e,color:#fff
```

---

## 6. Rendering Pipeline

```mermaid
flowchart LR
    subgraph Scene["Three.js Scene"]
        SC_[scene]
        CAM[camera]
    end

    subgraph Render["WebGLRenderer"]
        RT[Off-screen<br/>WebGLRenderTarget]
        SH[Blur Shader<br/>8 samples]
        QUAD[Fullscreen Quad<br/>PlaneGeometry 2×2]
    end

    subgraph Output
        SCREEN[Screen]
    end

    SC_ -->|render to RT| RT
    CAM -->|viewport| RT
    RT --> SH
    SH --> QUAD
    QUAD --> SCREEN

    RT -.->|skip when intensity=0| SCREEN

    style Scene fill:#0f3460,color:#fff
    style Render fill:#533483,color:#fff
    style Output fill:#e94560,color:#fff
```

---

## 7. Builder → Community → World Flow

```mermaid
flowchart TD
    A[Enter Builder] --> B[Select Part<br/>from Catalog]
    B --> C[Place on Grid<br/>Left Click]
    C --> D[Test Play<br/>▶ Button]
    D --> E{Happy with Track?}
    E -->|No| F[Undo / Clear]
    F --> B
    E -->|Yes| G{Save Locally<br/>or Share?}
    G -->|Local| H[Save to localStorage]
    G -->|Share| I[Share to Community<br/>shared_tracks collection]
    I --> J[Other Players Browse<br/>Community Modal]
    J --> K[Like / Rate / Play]
    K --> L[Load into Builder]
    L --> M[Edit & Re-share]
    G -->|World| N[Enter World Grid]
    N --> O[Claim Site]
    O --> P[Open Builder on Site]
    P --> Q[Save Parts to Site]
    Q --> R[Other Players Visit<br/>via Neighbor Preview]
    R --> S[Play / Buy Site<br/>on Marketplace]

    style A fill:#0f3460,color:#fff
    style I fill:#e94560,color:#fff
    style N fill:#533483,color:#fff
    style S fill:#e94560,color:#fff
```

---

*Render with: GitHub (paste into .md), [Mermaid Live Editor](https://mermaid.live), or VS Code Mermaid extension.*
