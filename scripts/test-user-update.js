#!/usr/bin/env node
/**
 * Basit site testi - HTML yapısı ve JavaScript syntax kontrolü
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 ERN-ÇİÇEK Site Testleri Başlıyor...\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// Test 1: anasayfa.html exists
test('anasayfa.html dosyası mevcut', () => {
  const filePath = path.join(process.cwd(), 'anasayfa.html');
  assert(fs.existsSync(filePath), 'anasayfa.html bulunamadı');
});

// Test 2: HTML structure valid
test('HTML yapısı geçerli (DOCTYPE, html, head, body)', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'anasayfa.html'), 'utf8');
  assert(html.includes('<!doctype html>') || html.includes('<!DOCTYPE html>'), 'DOCTYPE eksik');
  assert(html.includes('<html'), '<html> tag eksik');
  assert(html.includes('<head'), '<head> tag eksik');
  assert(html.includes('<body'), '<body> tag eksik');
  assert(html.includes('</html>'), '</html> kapanış eksik');
});

// Test 3: products.json valid
test('products.json geçerli JSON', () => {
  const filePath = path.join(process.cwd(), 'products.json');
  assert(fs.existsSync(filePath), 'products.json bulunamadı');
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);
  assert(data && (Array.isArray(data.items) || Array.isArray(data)), 'products.json items array içermeli');
});

// Test 4: Required DOM elements exist
test('Gerekli DOM elementleri HTML içinde mevcut', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'anasayfa.html'), 'utf8');
  assert(html.includes('id="products"'), '#products elementi eksik');
  assert(html.includes('id="authModal"'), '#authModal elementi eksik');
  assert(html.includes('id="cartBtn"'), '#cartBtn elementi eksik');
});

// Test 5: Key functions defined
test('Önemli JavaScript fonksiyonları tanımlı', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'anasayfa.html'), 'utf8');
  assert(html.includes('function loadProducts'), 'loadProducts fonksiyonu eksik');
  assert(html.includes('function openAuthModal'), 'openAuthModal fonksiyonu eksik');
  assert(html.includes('function loginUser'), 'loginUser fonksiyonu eksik');
  assert(html.includes('function addToCart'), 'addToCart fonksiyonu eksik');
});

// Test 6: Event delegation handler exists
test('Event delegation handler mevcut', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'anasayfa.html'), 'utf8');
  assert(html.includes('extendDelegation'), 'extendDelegation handler eksik');
  assert(html.includes("case 'open-auth'"), 'open-auth action handler eksik');
  assert(html.includes("case 'open-cart'"), 'open-cart action handler eksik');
});

// Test 7: No obvious syntax errors (balanced braces check)
test('Script tag yapısı dengeli', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'anasayfa.html'), 'utf8');
  // JS string içindeki script tag'larını hariç tut (tek tırnak içindekiler)
  const cleanHtml = html.replace(/'<script>.*?<\\\/script>'/g, '');
  const scriptTags = cleanHtml.match(/<script[^>]*>/g) || [];
  const closeScriptTags = cleanHtml.match(/<\/script>/g) || [];
  assert(scriptTags.length === closeScriptTags.length, 
    `Script tag dengesiz: ${scriptTags.length} açılış, ${closeScriptTags.length} kapanış`);
});

// Test 8: site-settings.json exists (optional)
test('site-settings.json mevcut', () => {
  const filePath = path.join(process.cwd(), 'site-settings.json');
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    JSON.parse(content); // throws if invalid
  }
  // Pass even if file doesn't exist (optional)
});

// Summary
console.log('\n' + '='.repeat(40));
console.log(`📊 Sonuç: ${passed} geçti, ${failed} başarısız`);
console.log('='.repeat(40));

if (failed > 0) {
  process.exit(1);
}
