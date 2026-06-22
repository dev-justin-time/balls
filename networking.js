/*
 networking.js — Networking bootstrap (loaded before main.js / assets).
 Sets up the THREE.js loading manager hooks and initializes
 the WebSimSocket room BEFORE any asset loading begins, so
 fallback/error handling is in place from the start.
*/
import { setupLoadingManager, initNetworking, setupGlobalErrorHandlers } from './src/networking.js';

// Set up loading progress/error hooks BEFORE any assets load
setupLoadingManager();

// Initialize networking (top-level await — blocks main.js until ready)
const room = await initNetworking();

export { room, setupGlobalErrorHandlers };
