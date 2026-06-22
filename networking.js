/*
 networking.js — Networking bootstrap (loaded before main.js / assets).
 Sets up the THREE.js loading manager hooks and initializes
 the WebSimSocket room BEFORE any asset loading begins, so
 fallback/error handling is in place from the start.
*/
import * as THREE from 'three';
import { setupLoadingManager, initNetworking } from './src/networking.js';

console.log('[networking.js] Bootstrap started — setting up loading manager and initializing networking BEFORE main.js loads assets.');

// Set up loading progress/error hooks BEFORE any assets load
setupLoadingManager();

// Initialize networking (top-level await — blocks main.js until ready)
const room = await initNetworking();

console.log('[networking.js] Networking initialized. Now main.js will begin loading.');

export { room };
