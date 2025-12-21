#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Fix corrupted Turkish characters in order and user files
 * Handles partial mojibake where certain characters got mangled
 */

// Direct character replacements for known mojibake patterns
const FIXES = {
  'ğ±': 'ı',      // ğ± → ı
  'ğ°': 'ı',      // ğ° → ı (corrupted ı from broken encoding)
  'Cağ': 'Çağ',   // Cağ → Çağ (some C without cedilla)
  'Ka±': 'Kaç',   // Ka± → Kaç
  'Ka°': 'Kaç',   // Ka° → Kaç (from broken ç)
};

function fixMojibake(str) {
  if (!str || typeof str !== 'string') return str;
  let result = str;
  Object.entries(FIXES).forEach(([broken, fixed]) => {
    result = result.split(broken).join(fixed);
  });
  return result;
}

function fixOrderFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const order = JSON.parse(content);
    let modified = false;

    // Fix address
    if (order.address) {
      const fixed = fixMojibake(order.address);
      if (fixed !== order.address) {
        console.log(`  Address: "${order.address}" → "${fixed}"`);
        order.address = fixed;
        modified = true;
      }
    }

    // Fix customer name
    if (order.customerName) {
      const fixed = fixMojibake(order.customerName);
      if (fixed !== order.customerName) {
        console.log(`  Name: "${order.customerName}" → "${fixed}"`);
        order.customerName = fixed;
        modified = true;
      }
    }

    // Fix product names
    if (order.items && Array.isArray(order.items)) {
      order.items.forEach((item, idx) => {
        if (item.name) {
          const fixed = fixMojibake(item.name);
          if (fixed !== item.name) {
            console.log(`  Item ${idx}: "${item.name}" → "${fixed}"`);
            item.name = fixed;
            modified = true;
          }
        }
      });
    }

    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(order, null, 2) + '\n', 'utf8');
      return true;
    }
    return false;
  } catch (err) {
    console.error(`  Error: ${err.message}`);
    return false;
  }
}

function fixUserFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const user = JSON.parse(content);
    let modified = false;

    // Fix address
    if (user.address) {
      const fixed = fixMojibake(user.address);
      if (fixed !== user.address) {
        console.log(`  Address: "${user.address}" → "${fixed}"`);
        user.address = fixed;
        modified = true;
      }
    }

    // Fix name
    if (user.name) {
      const fixed = fixMojibake(user.name);
      if (fixed !== user.name) {
        console.log(`  Name: "${user.name}" → "${fixed}"`);
        user.name = fixed;
        modified = true;
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(user, null, 2) + '\n', 'utf8');
      return true;
    }
    return false;
  } catch (err) {
    console.error(`  Error: ${err.message}`);
    return false;
  }
}

// Main
const ordersDir = path.join(__dirname, '../orders');
const usersDir = path.join(__dirname, '../users');

console.log('🔧 Fixing corrupted Turkish characters in orders and users...\n');

let fixedCount = 0;

// Fix orders
if (fs.existsSync(ordersDir)) {
  console.log('📋 Orders:');
  const files = fs.readdirSync(ordersDir).filter(f => f.endsWith('.json'));
  files.forEach(file => {
    const filePath = path.join(ordersDir, file);
    if (fixOrderFile(filePath)) {
      fixedCount++;
    }
  });
  console.log(`  ✅ Fixed ${fixedCount} order files\n`);
}

// Fix users
let userFixedCount = 0;
if (fs.existsSync(usersDir)) {
  console.log('👤 Users:');
  const files = fs.readdirSync(usersDir).filter(f => f.endsWith('_full.json'));
  files.forEach(file => {
    const filePath = path.join(usersDir, file);
    if (fixUserFile(filePath)) {
      userFixedCount++;
    }
  });
  console.log(`  ✅ Fixed ${userFixedCount} user files\n`);
}

console.log(`✨ Total fixed: ${fixedCount + userFixedCount} files`);
