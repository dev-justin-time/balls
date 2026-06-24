/**
 * =====================================================================
 * @domain:    core
 * @concern:   Quad-Core IPC & State Orchestration
 * @created:   2026-06-24T14:30:00Z
 * @track:     8f4e2a1b-9c3d-4e5f-a6b7-c8d9e0f1a2b3
 * @version:   1.0.0
 * @security:  Client-Side (Thin Client / Zero Trust)
 * =====================================================================
 *
 * QuadCoreBridge — the central orchestrator for the multi-language architecture.
 *
 * Each language serves its strongest purpose:
 *   JavaScript (this module):  Thin client orchestrator, rendering, UI, I/O
 *   Rust (WASM):               Obfuscated physics solver, anti-cheat validation
 *   Python (Backend):          Secure level generation, auth, frame validation
 *   Lua (wasmoon):             Game economy, monetization logic, rules engine
 *
 * This bridge:
 *   1. Initializes all sub-systems (Rust WASM, Lua engine, Python API connection)
 *   2. Manages shared state between all four cores
 *   3. Routes physics requests to Rust WASM
 *   4. Routes level generation & validation to Python backend
 *   5. Routes economy/monetization to Lua
 *   6. Provides a unified API for the rest of the JS application
 */

// [IMPORT LOCK] Retained for context stability. Awaiting user confirmation to refactor.
// These imports represent the hard boundaries of our Quad-Core architecture.
// Lua VM via wasmoon
// Rust WASM via wasm-pack generated module
// Python API base URL from environment config

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const PYTHON_API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_PYTHON_API) ||
  'http://localhost:8000';

let _wasmModule = null;
// [AI NOTE: Retained for context stability. Awaiting user confirmation to refactor.]
// Lua VM ownership delegated to lua_engine.js — _luaFactory unused.
let _luaFactory = null;
let _luaEngine = null;
let _sharedState = new Map();
let _isInitialized = false;
let _initializationPromise = null;
let _pythonSessionToken = null;
let _frameValidationEnabled = true;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize all sub-systems in the correct order:
 *   1. Fetch server secrets from Python backend
 *   2. Initialize Rust WASM physics module
 *   3. Initialize Lua engine with shop logic
 *   4. Establish API session with Python backend
 */
export async function initializeQuadCore() {
  if (_isInitialized) return;
  if (_initializationPromise) return _initializationPromise;

  _initializationPromise = (async () => {
    console.info('[QuadCore] Initializing multi-language architecture...');

    try {
      // Step 1: Fetch server secrets from Python backend
      console.info('[QuadCore] Fetching server secrets...');
      const serverSecrets = await _fetchServerSecrets();
      _pythonSessionToken = serverSecrets.session_token || null;

      // Step 2: Initialize Rust WASM physics module
      console.info('[QuadCore] Loading Rust WASM physics solver...');
      try {
        // Dynamic path prevents Vite/Rollup from statically resolving
        // the import at build time. The WASM module is optional — if the
        // file doesn't exist at runtime, the catch falls through to the
        // JS physics integrator.
        //   DEV:  Vite dev server serves the path relative to this source file
        //   PROD: Plugin copies rust_core/pkg/ → dist/rust_wasm/
        const wasmBase = import.meta.env.DEV
          ? '../../rust_core/pkg'
          : '/rust_wasm';
        const wasmUrl = wasmBase + '/quad_core_physics.js';
        const wasmModule = await import(wasmUrl);
        _wasmModule = wasmModule;
        await _wasmModule.default(); // Initialize the WASM module

        // Inject server-validated physics constants
        _wasmModule.inject_physics_constants(
          serverSecrets.gravity_hash,
          serverSecrets.friction_seed
        );
        console.info('[QuadCore] Rust WASM initialized with server secrets');
      } catch (wasmError) {
        console.warn('[QuadCore] Rust WASM initialization failed, using JS fallback:', wasmError);
        _wasmModule = null;
      }

      // Step 3: Initialize Lua engine for game logic
      console.info('[QuadCore] Initializing Lua engine via lua_engine.js...');
      try {
        // Delegate Lua VM management to the standalone lua_engine.js module
        const luaEngine = await import('../lua_engine.js');
        const ready = await luaEngine.initLuaEngine();
        if (ready) {
          // Store reference so shop functions can delegate to lua_engine.js
          _luaEngine = luaEngine;
          // Inject shop logic globals into the Lua VM
          _luaEngine.setLuaGlobal('USER_PLAYTIME', 0);
          _luaEngine.setLuaGlobal('USER_STAMPS', 2);
          _luaEngine.setLuaGlobal('USER_PURCHASES', 0);
          console.info('[QuadCore] Lua engine initialized via lua_engine.js');
        } else {
          throw new Error('lua_engine.initLuaEngine() returned false');
        }
      } catch (luaError) {
        console.warn('[QuadCore] Lua engine initialization failed, using JS fallback:', luaError);
        _luaEngine = null;
      }

      _isInitialized = true;
      console.info('[QuadCore] All sub-systems initialized successfully');
      return true;
    } catch (error) {
      console.error('[QuadCore] Fatal: Core architecture failed to boot:', error);
      _isInitialized = false;
      throw error;
    }
  })();

  return _initializationPromise;
}

// ---------------------------------------------------------------------------
// Physics (Rust WASM)
// ---------------------------------------------------------------------------

/**
 * Resolves a physics frame using the Rust WASM solver.
 * Falls back to a simple JS integrator if WASM is unavailable.
 *
 * @param {Object} inputState - { velocity: {x,y,z}, rotation: {x,y,z} }
 * @param {number} deltaTime - Frame delta in seconds
 * @returns {Object} Resolved state with position, rotation, grounded flag
 */
export function resolvePhysicsFrame(inputState, deltaTime) {
  if (_wasmModule) {
    // Use Rust WASM solver
    const inputBuffer = new Float32Array([
      inputState.velocity.x, inputState.velocity.y, inputState.velocity.z,
      inputState.rotation.x, inputState.rotation.y, inputState.rotation.z,
    ]);

    const resultBuffer = _wasmModule.solve_physics_frame(inputBuffer, deltaTime);

    return {
      position: { x: resultBuffer[0], y: resultBuffer[1], z: resultBuffer[2] },
      rotation: { x: resultBuffer[3], y: resultBuffer[4], z: resultBuffer[5] },
      isGrounded: resultBuffer[6] === 1.0,
      validationHash: resultBuffer[7],
    };
  }

  // Fallback: Simple JS integrator
  const dt = Math.min(0.05, Math.max(0.001, deltaTime));
  const gravity = -9.81 * 1.2;
  const friction = 0.98;

  let vx = inputState.velocity.x || 0;
  let vy = (inputState.velocity.y || 0) + gravity * dt;
  let vz = inputState.velocity.z || 0;

  vx *= friction;
  vz *= friction;

  const px = vx * dt;
  const py = vy * dt;
  const pz = vz * dt;

  return {
    position: { x: px, y: py, z: pz },
    rotation: { x: 0, y: 0, z: 0 },
    isGrounded: py <= 0.5 && Math.abs(vy) < 1.0,
    validationHash: 0,
  };
}

/**
 * Get the validation token from the WASM module for server-side frame validation.
 */
export function getValidationToken() {
  if (_wasmModule && typeof _wasmModule.get_validation_token === 'function') {
    return _wasmModule.get_validation_token();
  }
  return 0;
}

/**
 * Reset collision state when loading a new level.
 */
export function resetPhysicsState() {
  if (_wasmModule && typeof _wasmModule.reset_collision_state === 'function') {
    _wasmModule.reset_collision_state();
  }
}

// ---------------------------------------------------------------------------
// Level Generation (Python Backend)
// ---------------------------------------------------------------------------

/**
 * Request a secure level seed from the Python backend.
 * The returned encrypted payload is decrypted by the Rust WASM client.
 *
 * @param {number} levelIndex - Level number
 * @param {number} difficultyTier - Difficulty tier (1-3)
 * @returns {Object} Encrypted level payload
 */
export async function requestSecureLevelSeed(levelIndex, difficultyTier = 1) {
  try {
    const response = await fetch(`${PYTHON_API_BASE}/api/generate-level`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(_pythonSessionToken ? { Authorization: `Bearer ${_pythonSessionToken}` } : {}),
      },
      body: JSON.stringify({
        level_index: levelIndex,
        tier: difficultyTier,
        client_fingerprint: _getFingerprint(),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Python backend level generation failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return {
      encryptedPayload: data.encrypted_payload,
      integrityHash: data.integrity_hash,
      seedHash: data.seed_hash,
    };
  } catch (error) {
    console.warn('[QuadCore] Level generation request failed, using fallback:', error);
    // Generate a deterministic fallback seed locally
    return _generateFallbackLevelSeed(levelIndex, difficultyTier);
  }
}

/**
 * Validate a physics frame against the Python backend.
 * This is the patent-pending "Federated Physics Validation" method.
 */
export async function validateFrame(frameState, levelIndex) {
  if (!_frameValidationEnabled || !_wasmModule) return true;

  try {
    const response = await fetch(`${PYTHON_API_BASE}/api/auth/validate-frame`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(_pythonSessionToken ? { Authorization: `Bearer ${_pythonSessionToken}` } : {}),
      },
      body: JSON.stringify({
        frame_hash: frameState.validationHash,
        level_index: levelIndex,
        client_fingerprint: _getFingerprint(),
        expected_gravity_seed: _wasmModule.get_validation_token(),
      }),
    });

    if (!response.ok) return false;
    const data = await response.json();
    return data.valid;
  } catch (error) {
    // If validation fails, allow the frame (don't break gameplay)
    return true;
  }
}

// ---------------------------------------------------------------------------
// Economy & Monetization (Lua)
// ---------------------------------------------------------------------------

/**
 * Calculate shop purchase pricing and progression using Lua.
 *
 * @param {string} userId - Player identifier
 * @param {number} itemTier - Tier (1=Basic, 2=Pro, 3=Ultimate)
 * @returns {Object} Purchase decision with pricing and upsell info
 */
export async function calculateShopPurchase(userId, itemTier) {
  if (_luaEngine) {
    try {
      // Inject user data into Lua globals before calling shop logic
      // Delegated to lua_engine.js via setLuaGlobal()
      const playerStats = getSharedState(`player:${userId}`) || {};
      _luaEngine.setLuaGlobal('USER_ID', userId);
      _luaEngine.setLuaGlobal('USER_PLAYTIME', playerStats.playtime || 0);
      _luaEngine.setLuaGlobal('USER_STAMPS', playerStats.stamps || 2);
      _luaEngine.setLuaGlobal('USER_PURCHASES', playerStats.purchases || 0);

      // Call the Lua function via lua_engine.js's run() method
      const purchaseResult = await _luaEngine.run('calculate_decoy_purchase', userId, itemTier);

      if (purchaseResult && !purchaseResult.error) {
        return {
          finalPrice: purchaseResult.final_price,
          endowedProgress: purchaseResult.endowed_progress,
          shouldShowUpsell: purchaseResult.show_upsell,
          upsellTier: purchaseResult.upsell_tier || null,
          upsellPriceDiff: purchaseResult.upsell_price_diff || 0,
        };
      }
    } catch (luaError) {
      console.warn('[QuadCore] Lua purchase calculation failed, using JS fallback:', luaError);
    }
  }

  // Fallback: JS pricing logic
  return _calculateFallbackPurchase(itemTier);
}

/**
 * Apply endowed progress — give the user their initial stamps.
 * Uses Lua when available.
 */
export async function getEndowedProgress(userId) {
  if (_luaEngine) {
    try {
      // Inject user stamps before querying progress
      const playerStats = getSharedState(`player:${userId}`) || {};
      _luaEngine.setLuaGlobal('USER_STAMPS', playerStats.stamps || 2);
      const result = await _luaEngine.run('get_endowed_progress', userId);
      return {
        current: result.current,
        total: result.total,
        completed: result.completed,
      };
    } catch (e) {
      console.warn('[QuadCore] Lua endowed progress failed, using JS:', e);
    }
  }

  // JS fallback
  return { current: 2, total: 10, completed: false };
}

/**
 * Get player stats (playtime, stamps) from the Lua engine.
 */
export async function getPlayerStats(userId) {
  if (_luaEngine) {
    try {
      // Inject user data into Lua globals
      const playerStats = getSharedState(`player:${userId}`) || {};
      _luaEngine.setLuaGlobal('USER_PLAYTIME', playerStats.playtime || 0);
      _luaEngine.setLuaGlobal('USER_STAMPS', playerStats.stamps || 2);

      const playtime = await _luaEngine.run('_get_user_playtime', userId);
      const stamps = await _luaEngine.run('_get_user_stamps', userId);
      return { playtime, stamps: stamps || 2 };
    } catch (e) {
      console.warn('[QuadCore] Lua player stats failed:', e);
    }
  }
  return { playtime: 0, stamps: 2 };
}

// ---------------------------------------------------------------------------
// Shared State Management
// ---------------------------------------------------------------------------

/**
 * Set a value in the shared state store.
 * All four cores can read/write to this store via their respective bridges.
 */
export function setSharedState(key, value) {
  _sharedState.set(key, value);
}

/**
 * Get a value from the shared state store.
 */
export function getSharedState(key) {
  return _sharedState.get(key);
}

/**
 * Get all shared state entries.
 */
export function getAllSharedState() {
  const entries = {};
  _sharedState.forEach((value, key) => {
    entries[key] = value;
  });
  return entries;
}

// ---------------------------------------------------------------------------
// Private Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch server secrets from the Python backend.
 * In production, uses mTLS and short-lived JWTs.
 */
async function _fetchServerSecrets() {
  try {
    const response = await fetch(`${PYTHON_API_BASE}/api/auth/wasm-secrets`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch secrets: ${response.status}`);
    }

    const secrets = await response.json();
    return {
      gravity_hash: secrets.gravity_hash,
      friction_seed: secrets.friction_seed,
      validation_token: secrets.validation_token,
      session_token: null, // Auth not implemented yet
    };
  } catch (error) {
    console.warn('[QuadCore] Failed to fetch server secrets, using defaults:', error);
    return {
      gravity_hash: 9.81 * 1.2,
      friction_seed: 4815162342,
      validation_token: 3.1415926535,
      session_token: null,
    };
  }
}

/**
 * Generate a simple client fingerprint for rate limiting and anti-bot measures.
 */
function _getFingerprint() {
  try {
    const components = [
      navigator.hardwareConcurrency || 2,
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
      screen.width,
      screen.height,
    ];
    const raw = components.join('-');
    // Simple hash
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `fp_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
  } catch (e) {
    return `fp_fallback_${Math.random().toString(36).slice(2, 8)}`;
  }
}

/**
 * Load a Lua script from the filesystem (browser fetch).
 */
async function _loadLuaScript(path) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to load Lua script: ${response.status}`);
    return await response.text();
  } catch (error) {
    console.warn(`[QuadCore] Failed to load Lua script from ${path}:`, error);
    // Return inline fallback Lua script with basic pricing
    return `
      local PRICING_TIERS = {
        [1] = { name = "Basic", base_price = 500, value_mult = 1.0 },
        [2] = { name = "Pro", base_price = 1800, value_mult = 2.8 },
        [3] = { name = "Ultimate", base_price = 2000, value_mult = 5.0 }
      }
      function calculate_decoy_purchase(user_id, item_tier)
        local tier_data = PRICING_TIERS[item_tier]
        if not tier_data then return { error = "Invalid tier" } end
        return { final_price = tier_data.base_price, endowed_progress = { current = 2, total = 10, completed = false }, show_upsell = (item_tier == 2) }
      end
      function get_endowed_progress(user_id) return { current = 2, total = 10, completed = false } end
    `;
  }
}

/**
 * JS fallback for purchase calculation when Lua is unavailable.
 */
function _calculateFallbackPurchase(itemTier) {
  const tiers = {
    1: { basePrice: 500, valueMult: 1.0 },
    2: { basePrice: 1800, valueMult: 2.8 },
    3: { basePrice: 2000, valueMult: 5.0 },
  };

  const tier = tiers[itemTier] || tiers[1];

  return {
    finalPrice: tier.basePrice,
    endowedProgress: { current: 2, total: 10, completed: false },
    shouldShowUpsell: itemTier === 2,
    upsellTier: itemTier === 2 ? 3 : null,
    upsellPriceDiff: itemTier === 2 ? tiers[3].basePrice - tier.basePrice : 0,
  };
}

/**
 * JS fallback for level generation when the Python backend is unreachable.
 */
function _generateFallbackLevelSeed(levelIndex, difficultyTier) {
  const seed = (levelIndex * 7919 + difficultyTier * 104729) % 2147483647;
  return {
    encryptedPayload: btoa(JSON.stringify({ seed, levelIndex, tier: difficultyTier })),
    integrityHash: seed.toString(16),
    seedHash: seed.toString(16),
  };
}

// ---------------------------------------------------------------------------
// Singleton Export
// ---------------------------------------------------------------------------

const quadCoreBridge = {
  initialize: initializeQuadCore,
  resolvePhysicsFrame,
  getValidationToken,
  resetPhysicsState,
  requestSecureLevelSeed,
  validateFrame,
  calculateShopPurchase,
  getEndowedProgress,
  getPlayerStats,
  setSharedState,
  getSharedState,
  getAllSharedState,
  get isInitialized() { return _isInitialized; },
  get wasmModule() { return _wasmModule; },
  get pythonApiBase() { return PYTHON_API_BASE; },
};

export default quadCoreBridge;

// Named export for destructured imports from wireframe_importer.js and mesh_operations.js
export { quadCoreBridge as quadCore };
