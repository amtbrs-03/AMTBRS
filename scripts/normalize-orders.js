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
const INVOICES_DIR = path.resolve(__dirname, '..', 'invoices');

// Regex to detect typical mojibake markers
const MOJIBAKE_RE = /Ã|Ä|Å|â‚º|ğŸ|â•/;

// Direct replacement mapping (single-pass artifacts)
const DIRECT_MAP = [
  [/Ãœ/g,'Ü'],[/Ã¼/g,'ü'],[/Ã‡/g,'Ç'],[/Ã§/g,'ç'],[/Ã–/g,'Ö'],[/Ã¶/g,'ö'],[/ÄŸ/g,'ğ'],[/ÅŸ/g,'ş'],[/Ä±/g,'ı'],[/Ä°/g,'İ'],[/â‚º/g,'₺'],
  [/â€™/g,"'"],[/â€œ/g,'"'],[/â€�/g,'"'],[/â€“/g,'–'],[/â€”/g,'—'],
];

function iterativeDecode(str){
  let cur = str;
  for (let i=0;i<5;i++) { // up to 5 passes for deeply nested sequences
    try {
      const next = decodeURIComponent(escape(cur));
      if (next === cur) break;
      cur = next;
    } catch { break; }
  }
  return cur;
}

function normalizeText(s) {
  if (typeof s !== 'string') return s;
  // Fast path: if no mojibake markers, return as-is
  if (!MOJIBAKE_RE.test(s)) return s;
  let out = iterativeDecode(s);
  // Apply direct mapping replacements
  DIRECT_MAP.forEach(([re, rep]) => { out = out.replace(re, rep); });
  // Second decode pass if still markers
  if (MOJIBAKE_RE.test(out)) out = iterativeDecode(out);
  return out;
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

function processDir(dirPath, label){
  if (!fs.existsSync(dirPath)) {
    console.warn(label + ' directory not found:', dirPath);
    return {ok:0, fail:0};
  }
  const entries = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
  let ok=0, fail=0;
  for (const f of entries){
    const filePath = path.join(dirPath, f);
    const res = normalizeFile(filePath);
    if (res) ok++; else fail++;
  }
  return {ok, fail};
}

function main() {
  const ordersResult = processDir(ORDERS_DIR, 'Orders');
  const invoicesResult = processDir(INVOICES_DIR, 'Invoices');
  console.log(`Orders: ${ordersResult.ok} ok, ${ordersResult.fail} failed.`);
  console.log(`Invoices: ${invoicesResult.ok} ok, ${invoicesResult.fail} failed.`);
}

if (require.main === module) {
  main();
}
