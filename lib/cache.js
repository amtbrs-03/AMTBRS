// lib/cache.js
// localStorage memory cache wrapper - shared utility

const _cache = {};

export function getCached(key) {
  if (!_cache[key]) {
    try {
      const raw = localStorage.getItem(key);
      _cache[key] = raw ? JSON.parse(raw) : null;
    } catch (e) {
      _cache[key] = null;
    }
  }
  return _cache[key];
}

export function setCached(key, value) {
  _cache[key] = value;
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch (e) {
    console.warn('setCached: localStorage write failed', e);
  }
}

export function clearCache(key) {
  if (key) {
    delete _cache[key];
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('clearCache: localStorage remove failed', e);
    }
  } else {
    // Clear all
    Object.keys(_cache).forEach(k => delete _cache[k]);
  }
}

export function getCacheSize() {
  return Object.keys(_cache).length;
}
