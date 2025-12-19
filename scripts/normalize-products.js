#!/usr/bin/env node

/*
  Normalize products.json sortOrder
  - Ensures items are sorted deterministically and get sortOrder 1..N.
  - If a product has sortOrder <= 0 or missing, it's treated as "end".

  Usage:
    node scripts/normalize-products.js
    node scripts/normalize-products.js path/to/products.json
    node scripts/normalize-products.js --check
*/

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { check: false, file: 'products.json' };
  for (const a of argv) {
    if (a === '--check') args.check = true;
    else if (!a.startsWith('-')) args.file = a;
  }
  return args;
}

function normalizeProductIdKey(pid) {
  return String(pid || '').toLowerCase().replace(/\.(jpg|jpeg|png|webp)$/i, '');
}

function effectiveSortOrder(p) {
  const so = Number(p && p.sortOrder);
  return Number.isFinite(so) && so > 0 ? so : 999999;
}

function compareProducts(a, b) {
  const ao = effectiveSortOrder(a);
  const bo = effectiveSortOrder(b);
  if (ao !== bo) return ao - bo;

  const an = String((a && a.name) || '');
  const bn = String((b && b.name) || '');
  const nc = an.localeCompare(bn, 'tr');
  if (nc !== 0) return nc;

  return String((a && a.id) || '').localeCompare(String((b && b.id) || ''), 'tr');
}

function normalizeItems(items) {
  const list = Array.isArray(items) ? [...items] : [];
  list.sort(compareProducts);
  return list.map((p, i) => ({ ...(p || {}), sortOrder: i + 1 }));
}

function main() {
  const { check, file } = parseArgs(process.argv.slice(2));
  const filePath = path.resolve(process.cwd(), file);

  const raw = fs.readFileSync(filePath, 'utf8');
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    console.error(`[normalize-products] JSON parse failed: ${file}: ${e.message}`);
    process.exit(2);
  }

  const items = Array.isArray(obj?.items) ? obj.items : (Array.isArray(obj) ? obj : []);
  const normalizedItems = normalizeItems(items);

  // Keep any extra top-level fields (if products.json is an object)
  const out = Array.isArray(obj)
    ? { updatedAt: Date.now(), items: normalizedItems }
    : (() => {
        const { items: _items, updatedAt: _updatedAt, ...rest } = (obj && typeof obj === 'object') ? obj : {};
        return { ...rest, updatedAt: Date.now(), items: normalizedItems };
      })();

  const next = JSON.stringify(out, null, 2) + '\n';
  const changed = next !== (raw.endsWith('\n') ? raw : raw + '\n');

  if (check) {
    if (changed) {
      console.error('[normalize-products] products.json needs normalization.');
      process.exit(1);
    }
    console.log('[normalize-products] OK (already normalized).');
    return;
  }

  if (!changed) {
    console.log('[normalize-products] No changes needed.');
    return;
  }

  fs.writeFileSync(filePath, next, 'utf8');
  console.log(`[normalize-products] Normalized: ${file}`);
}

main();
