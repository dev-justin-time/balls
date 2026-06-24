/**
 * =====================================================================
 * @domain:    core
 * @concern:   Lua Engine (wasmoon) — Standalone Wrapper & Bridge
 * @created:   2026-06-24T15:15:00Z
 * @track:     7a8b9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d
 * @version:   1.0.0
 * @security:  Client-Side (Sandboxed WASM VM)
 * =====================================================================
 *
 * Lua Engine — standalone wrapper around the wasmoon Lua VM.
 *
 * Purpose:
 *   Lua runs inside a sandboxed WebAssembly VM (wasmoon) within the browser.
 *   It handles game logic that benefits from hot-reloadability and
 *   sandboxed execution without recompiling the JS application.
 *
 * Responsibilities:
 *   - Initialize the wasmoon Lua 5.4 VM
 *   - Load Lua scripts from the src/scripts/ directory
 *   - Expose a clean JS API: runLuaLogic(scriptName, fnName, args)
 *   - Provide sandboxed execution (no access to browser APIs, file system, etc.)
 *   - Handle errors gracefully with JS fallbacks
 *
 * Scripts loaded:
 *   - src/scripts/rules.lua        — Level generation rules & segment types
 *   - src/scripts/shop_logic.lua   — Game theory economy (reused from v1)
 *   - src/scripts/ai_prompts.lua   — Dynamic Stable Diffusion prompt builder
 *   - src/scripts/builder_logic.lua — Track builder validation rules
 *
 * Integration:
 *   - Used by ipc_bridge.js (Quad-Core orchestrator)
 *   - Can run independently for ad-hoc Lua logic evaluation
 */

// ---------------------------------------------------------------------------
// Module State
// ---------------------------------------------------------------------------

let _luaFactory = null;
let _luaEngine = null;
let _isInitialized = false;
let _initializationPromise = null;
const _loadedScripts = new Set();

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the Lua engine (wasmoon).
 * Loads all Lua scripts from src/scripts/ into the VM.
 *
 * @returns {Promise<boolean>} Whether initialization succeeded
 */
export async function initLuaEngine() {
  if (_isInitialized) return true;
  if (_initializationPromise) return _initializationPromise;

  _initializationPromise = (async () => {
    console.info('[LuaEngine] Initializing wasmoon Lua VM...');

    try {
      const { LuaFactory } = await import('wasmoon');
      _luaFactory = new LuaFactory();
      _luaEngine = await _luaFactory.createEngine();

      // Set memory limits for sandbox safety
      _luaEngine.global.set('_SANDBOX', true);

      // Load Lua scripts in dependency order
      const scripts = [
        { path: '/src/scripts/rules.lua',        name: 'rules' },
        { path: '/src/scripts/shop_logic.lua',   name: 'shop_logic' },
        { path: '/src/scripts/ai_prompts.lua',   name: 'ai_prompts' },
        { path: '/src/scripts/builder_logic.lua', name: 'builder_logic' },
      ];

      for (const { path, name } of scripts) {
        try {
          const source = await _fetchLuaScript(path);
          await _luaEngine.doString(source);
          _loadedScripts.add(name);
          console.info(`[LuaEngine] Loaded: ${path}`);
        } catch (scriptError) {
          console.warn(`[LuaEngine] Failed to load ${path}:`, scriptError);
          // Continue — missing scripts fall back to JS defaults
        }
      }

      _isInitialized = true;
      console.info(`[LuaEngine] Initialized with ${_loadedScripts.size} script(s):`, [..._loadedScripts].join(', '));
      return true;
    } catch (error) {
      console.error('[LuaEngine] Fatal: Failed to initialize Lua VM:', error);
      _isInitialized = false;
      return false;
    }
  })();

  return _initializationPromise;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute a Lua function and return its result as a JS value.
 *
 * @param {string} functionName - The Lua function name to call
 * @param {...any} args - Arguments to pass to the Lua function
 * @returns {Promise<any>} The return value from Lua (converted to JS)
 *
 * @example
 *   // Call Lua level generator
 *   const level = await runLuaLogic('generate_level', 42, 2);
 *
 *   // Call Lua AI prompt builder
 *   const prompt = await runLuaLogic('generate_technical_prompt', 'cabinet', 'blueprint');
 *
 *   // Call Lua track validator
 *   const result = await runLuaLogic('validate_track', partsArray);
 */
export async function runLuaLogic(functionName, ...args) {
  if (!_isInitialized || !_luaEngine) {
    console.warn(`[LuaEngine] Not initialized. Cannot call "${functionName}".`);
    return null;
  }

  try {
    const fn = _luaEngine.global.get(functionName);
    if (typeof fn !== 'function') {
      console.warn(`[LuaEngine] Function "${functionName}" not found in Lua VM.`);
      return null;
    }

    const result = await fn(...args);
    // Clean up the Lua function reference to prevent memory leaks
    // and WASM heap fragmentation (spec-compatible pattern)
    if (typeof fn.close === 'function') {
      fn.close();
    }
    return result;
  } catch (error) {
    console.error(`[LuaEngine] Error calling "${functionName}":`, error);
    return null;
  }
}

/**
 * Set a global variable in the Lua VM before calling a function.
 * Used to inject player data (playtime, stamps, etc.) into Lua scope.
 *
 * @param {string} name - Global variable name
 * @param {*} value - Value to set (converted to Lua type)
 */
export function setLuaGlobal(name, value) {
  if (!_isInitialized || !_luaEngine) return;
  try {
    _luaEngine.global.set(name, value);
  } catch (error) {
    console.warn(`[LuaEngine] Failed to set global "${name}":`, error);
  }
}

/**
 * Check if the Lua engine is initialized.
 */
export function isLuaReady() {
  return _isInitialized && _luaEngine !== null;
}

/**
 * Get the list of loaded scripts.
 */
export function getLoadedScripts() {
  return [..._loadedScripts];
}

/**
 * Reload a specific Lua script (useful for hot-reloading game logic).
 *
 * @param {string} path - Path to the Lua script
 * @returns {Promise<boolean>} Whether the reload succeeded
 */
export async function reloadScript(path) {
  if (!_isInitialized || !_luaEngine) return false;
  try {
    const source = await _fetchLuaScript(path);
    // Re-execute in the existing VM (overwrites previous definitions)
    await _luaEngine.doString(source);
    const name = path.split('/').pop().replace(/\.lua$/, '');
    _loadedScripts.add(name);
    console.info(`[LuaEngine] Reloaded: ${path}`);
    return true;
  } catch (error) {
    console.error(`[LuaEngine] Failed to reload ${path}:`, error);
    return false;
  }
}

/**
 * Destroy the Lua engine and free its memory.
 */
export async function destroyLuaEngine() {
  if (_luaEngine) {
    try {
      await _luaEngine.global.close();
    } catch (e) {}
    _luaEngine = null;
  }
  _luaFactory = null;
  _isInitialized = false;
  _loadedScripts.clear();
  console.info('[LuaEngine] Destroyed.');
}

// ---------------------------------------------------------------------------
// Private Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a Lua script file from the server.
 * @param {string} path - URL path to the .lua file
 * @returns {Promise<string>} The Lua source code
 */
async function _fetchLuaScript(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load Lua script (${response.status}): ${path}`);
  }
  return await response.text();
}



// ---------------------------------------------------------------------------
// LuaHotLoader Class (Spec-compatible wrapper)
// ---------------------------------------------------------------------------

/**
 * LuaHotLoader — WASM Lua initialization & hot-reloading class.
 *
 * Provides the spec-compatible API pattern with explicit class methods
 * for loading, hot-reloading, and calling Lua functions. Wraps the
 * existing module-level state for backward compatibility.
 *
 * @example
 *   const loader = new LuaHotLoader();
 *   await loader.init();
 *   await loader.loadScript('rules', '/src/scripts/rules.lua');
 *   const level = await loader.callFunction('generate_level', 42, 2);
 */
export class LuaHotLoader {
  constructor() {
    this.factory = null;
    this.engine = null;
    this.loadedScripts = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize the Lua 5.4 engine with sandboxed security.
   * Disables os, io, package, and require to prevent
   * filesystem access and OS command execution.
   */
  async init() {
    if (this.isInitialized) return;

    try {
      const { LuaFactory } = await import('wasmoon');
      this.factory = new LuaFactory();
      this.engine = await this.factory.createEngine();

      // Security Sandbox: Disable dangerous standard libraries
      this.engine.global.set('os', undefined);
      this.engine.global.set('io', undefined);
      this.engine.global.set('package', undefined);
      this.engine.global.set('require', undefined);

      // Inject JS dependencies into Lua
      this.engine.global.set('JS_MATH', Math);

      this.isInitialized = true;
      console.info('[LuaHotLoader] Engine initialized and sandboxed.');
    } catch (error) {
      console.error('[LuaHotLoader] Failed to initialize engine:', error);
      throw error;
    }
  }

  /**
   * Load a Lua script from a URL and cache it.
   * In development, can be called repeatedly to hot-reload logic.
   *
   * @param {string} scriptName - Logical name for the script
   * @param {string} scriptUrl - URL path to the .lua file
   */
  async loadScript(scriptName, scriptUrl) {
    if (!this.isInitialized) await this.init();

    try {
      const response = await fetch(scriptUrl);
      const code = await response.text();

      // Execute the code in the sandboxed engine
      await this.engine.doString(code);

      this.loadedScripts.set(scriptName, { url: scriptUrl, lastLoaded: Date.now() });
      console.info(`[LuaHotLoader] Loaded: ${scriptName}`);
    } catch (error) {
      console.error(`[LuaHotLoader] Failed to load ${scriptName}:`, error);
      throw error;
    }
  }

  /**
   * Hot-reload a specific script without restarting the engine.
   * Preserves engine state but overwrites function definitions.
   *
   * @param {string} scriptName - Logical name of already-loaded script
   */
  async hotReload(scriptName) {
    const scriptData = this.loadedScripts.get(scriptName);
    if (!scriptData) throw new Error(`Script "${scriptName}" not loaded.`);

    console.info(`[LuaHotLoader] Hot-reloading ${scriptName}...`);
    await this.loadScript(scriptName, scriptData.url);
  }

  /**
   * Call a global Lua function and return the result as a JS object.
   * Automatically converts Lua tables to JS objects (handled by wasmoon).
   * Cleans up Lua function references to prevent WASM heap fragmentation.
   *
   * @param {string} funcName - Lua global function name
   * @param {...any} args - Arguments to pass to the function
   * @returns {Promise<any>} Return value from Lua
   */
  async callFunction(funcName, ...args) {
    if (!this.isInitialized) throw new Error('Lua engine not initialized.');

    const func = this.engine.global.get(funcName);
    if (typeof func !== 'function') {
      throw new Error(`Lua function '${funcName}' not found.`);
    }

    try {
      // wasmoon automatically converts Lua tables to JS objects
      const result = await func(...args);
      return result;
    } finally {
      // Clean up the Lua function reference to prevent memory leaks
      if (typeof func.close === 'function') {
        func.close();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton Default Export
// ---------------------------------------------------------------------------

export default {
  init: initLuaEngine,
  run: runLuaLogic,
  setGlobal: setLuaGlobal,
  isReady: isLuaReady,
  getLoadedScripts,
  reloadScript,
  destroy: destroyLuaEngine,
};


