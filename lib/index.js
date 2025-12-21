// lib/index.js
// Shared utilities library - export all modules

export { getCached, setCached, clearCache, getCacheSize } from './cache.js';
export { initMojibakeFix } from './mojibake.js';

// Initialization function to run all shared setup
export function initializeSharedLibrary() {
  // Initialize mojibake fix
  if (typeof initMojibakeFix === 'function') {
    initMojibakeFix();
  }
}
