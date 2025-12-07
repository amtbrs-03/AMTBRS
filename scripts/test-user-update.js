#!/usr/bin/env node
// Node.js mock for localStorage (for CI)
if (typeof localStorage === 'undefined') {
  global.localStorage = {
    _data: {},
    setItem: function (key, value) { this._data[key] = value; },
    getItem: function (key) { return this._data[key] || null; },
    removeItem: function (key) { delete this._data[key]; },
    clear: function () { this._data = {}; }
  };
}
// Polyfill fetch and alert for test environment
if (typeof global.fetch === 'undefined') {
  global.fetch = function(url, opts) {
    return Promise.reject(new Error('fetch is not implemented in test'));
  };
}
if (typeof global.window === 'undefined') global.window = {};
if (typeof global.window.alert === 'undefined') {
  global.window.alert = function(msg) { console.log('[alert]', msg); };
}
if (typeof global.alert === 'undefined') {
  global.alert = function(msg) { console.log('[alert]', msg); };
}

// Telefon kaydetme ve localStorage testi
function testSaveUserPhone() {
  // Mock input
  global.document = global.document || {};
  global.document.getElementById = function(id) {
    if (id === 'acctPhoneInput') {
      return { value: '+90 555 123 45 67', focus: function() {} };
    }
    return null;
  };
  // Temizle
  localStorage.setItem('user_test@example.com', JSON.stringify({ name: 'Test', email: 'test@example.com' }));
  // Fonksiyonu çağır
  if (typeof saveUserPhone === 'function') {
    saveUserPhone();
    var user = JSON.parse(localStorage.getItem('user_test@example.com') || '{}');
    if (user.phone === '+90 555 123 45 67') {
      console.log('✓ Telefon kaydı localStorage testinden geçti.');
    } else {
      console.error('✗ Telefon kaydı localStorage testinden geçemedi!');
    }
  } else {
    console.error('saveUserPhone fonksiyonu bulunamadı!');
  }
}
testSaveUserPhone();

if (typeof window.alert !== 'function') {
  window.alert = function(msg) {
    console.log('[alert]', msg);
  };
}
/*
Headless sanity tests for phone and address update flows using jsdom.
- Loads anasayfa.html scripts in a JSDOM document
- Mocks localStorage, fetch (site-settings and worker), and commitFullUserToRepo
- Exercises saveUserPhone() and address inline edit pipeline
*/

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

async function loadPage() {
  const htmlPath = path.join(__dirname, '..', 'anasayfa.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://ern-cicek.com.tr/',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  const doc = win.document;

  // Minimal wait for scripts
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Mock localStorage reliability
  win.localStorage.clear();

  // Seed currentUser and user record
  const email = 'test@example.com';
  const name = 'Test User';
  win.localStorage.setItem('currentUser', JSON.stringify({ email, name }));
  win.localStorage.setItem('user_' + email, JSON.stringify({ email, name, addresses: [] }));

  // Make required DOM elements for profile tab inputs
  const phoneInput = doc.createElement('input');
  phoneInput.id = 'acctPhoneInput';
  phoneInput.value = '+90 530 000 00 00';
  doc.body.appendChild(phoneInput);

  const statusDiv = doc.createElement('div');
  statusDiv.id = 'acctAddressStatus';
  doc.body.appendChild(statusDiv);

  const acctCity = doc.createElement('input');
  acctCity.id = 'acctCityInput';
  acctCity.value = 'İstanbul';
  doc.body.appendChild(acctCity);

  const acctDistrict = doc.createElement('input');
  acctDistrict.id = 'acctDistrictInput';
  acctDistrict.value = 'Kadıköy';
  doc.body.appendChild(acctDistrict);

  const acctDetail = doc.createElement('input');
  acctDetail.id = 'acctAddressDetailInput';
  acctDetail.value = 'Moda Mah. Örnek Sk. No:1 D:2';
  doc.body.appendChild(acctDetail);

  const acctZip = doc.createElement('input');
  acctZip.id = 'acctPostalCodeInput';
  acctZip.value = '34710';
  doc.body.appendChild(acctZip);

  // Stub commitFullUserToRepo to avoid real network
  win.commitFullUserToRepo = async function(userRecord) {
    // Basic assertion
    if (!userRecord || !userRecord.email) return false;
    // Simulate success
    return true;
  };

  // Mock fetch: site-settings and worker update-user endpoint
  const workerCalls = [];
  win.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) ? input.url : '';
    if (url.endsWith('/site-settings.json')) {
      return new win.Response(JSON.stringify({ orderEndpoint: 'https://worker.example.dev/send-order' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url === 'https://worker.example.dev/update-user') {
      workerCalls.push({ url, options: init });
      return new win.Response(JSON.stringify({ ok: true, commitOk: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    // Allow other fetches to be no-op
    return new win.Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  return { win, doc, workerCalls };
}

async function testPhoneUpdate() {
  const { win, workerCalls } = await loadPage();
  if (typeof win.saveUserPhone !== 'function') throw new Error('saveUserPhone not found');
  await win.saveUserPhone();
  const email = JSON.parse(win.localStorage.getItem('currentUser')).email;
  const full = JSON.parse(win.localStorage.getItem('user_' + email));
  if (!full || full.phone !== '+90 530 000 00 00') throw new Error('Phone not saved in localStorage');
  const workerHit = workerCalls.find(c => c.url === 'https://worker.example.dev/update-user');
  if (!workerHit) throw new Error('Worker update-user not called for phone');
  console.log('✓ Phone update test passed');
}

async function testAddressUpdate() {
  const { win, workerCalls, doc } = await loadPage();
  if (typeof win.saveUserAddress !== 'function') throw new Error('saveUserAddress not found');
  await win.saveUserAddress();
  const email = JSON.parse(win.localStorage.getItem('currentUser')).email;
  const full = JSON.parse(win.localStorage.getItem('user_' + email));
  if (!full || !full.address || full.address.city !== 'İstanbul') throw new Error('Address not saved in legacy object');
  if (!Array.isArray(full.addresses) || full.addresses.length === 0) throw new Error('Addresses array not updated');
  const def = full.addresses.find(a => a.isDefault);
  if (!def || def.city !== 'İstanbul' || def.district !== 'Kadıköy') throw new Error('Default address not correct');
  const workerHit = workerCalls.find(c => c.url === 'https://worker.example.dev/update-user');
  if (!workerHit) throw new Error('Worker update-user not called for address');
  console.log('✓ Address update test passed');
}

(async function main(){
  try {
    await testPhoneUpdate();
    await testAddressUpdate();
    console.log('\nAll tests passed.');
  } catch (e) {
    console.error('Test failed:', e.message || e);
    process.exit(1);
  }
})();
