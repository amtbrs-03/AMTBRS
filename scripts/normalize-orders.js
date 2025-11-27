#!/usr/bin/env node
/**
 * One-time orders/*.json UTF-8 normalization.
 * - Recursively walks all string fields and attempts to fix mojibake
 *   caused by Latin-1/UTF-8 mis-decoding using decodeURIComponent(escape(s)).
 * - Preserves non-string fields untouched.
 * - Writes normalized JSON back with stable formatting.
 */

const fs = require('fs');
const path = require('path');

const ORDERS_DIR = path.resolve(__dirname, '..', 'orders');

function normalizeText(s) {
  if (typeof s !== 'string') return s;
  try {
    // Heuristic fix for common UTF-8 mojibake (Latin-1 misinterpretation)
    const fixed = decodeURIComponent(escape(s));
    // If it changed to a significantly different string, accept; otherwise keep original.
    // Simple heuristic: if fixed has more non-ASCII letters typical in Turkish or differs.
    if (fixed !== s) {
      return fixed;
    }
    return s;
  } catch (_) {
    return s;
  }
}

function normalizeValue(v) {
  if (v == null) return v;
  if (typeof v === 'string') return normalizeText(v);
  if (Array.isArray(v)) return v.map(normalizeValue);
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) {
      out[k] = normalizeValue(v[k]);
    }
    return out;
  }
  return v;
}

function normalizeFile(filePath) {
  const raw = fs.readFileSync(filePath);
  // Try UTF-8 first; if fails, fall back to Latin-1 and then fix
  let jsonStr;
  try {
    jsonStr = raw.toString('utf8');
    JSON.parse(jsonStr); // validate
  } catch (_) {
    // Fallback: read latin1 then attempt fix via TextDecoder would need node >= v8; use Buffer
    jsonStr = raw.toString('latin1');
  }
  let obj;
  try {
    obj = JSON.parse(jsonStr);
  } catch (e) {
    // Try second pass: fix latin1 mojibake at string level before parse
    try {
      const fixedStr = decodeURIComponent(escape(jsonStr));
      obj = JSON.parse(fixedStr);
    } catch (e2) {
      console.error('Failed to parse JSON:', filePath, e.message);
      return false;
    }
  }

  const normalized = normalizeValue(obj);
  const outStr = JSON.stringify(normalized, null, 2) + '\n';
  fs.writeFileSync(filePath, outStr);
  return true;
}

function main() {
  if (!fs.existsSync(ORDERS_DIR)) {
    console.error('Orders directory not found:', ORDERS_DIR);
    process.exit(1);
  }
  const entries = fs.readdirSync(ORDERS_DIR).filter(f => f.endsWith('.json'));
  let ok = 0, fail = 0;
  for (const f of entries) {
    const filePath = path.join(ORDERS_DIR, f);
    const res = normalizeFile(filePath);
    if (res) ok++; else fail++;
  }
  console.log(`Normalized ${ok} files, ${fail} failed.`);
}

if (require.main === module) {
  main();
}
