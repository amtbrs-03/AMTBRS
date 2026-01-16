#!/usr/bin/env node
/**
 * PWA Screenshot Generator
 * Generates screenshot for manifest.json using puppeteer
 * 
 * Usage: node scripts/generate-pwa-screenshot.js
 * Requires: npm install puppeteer
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS = [
  {
    name: 'home.png',
    url: 'https://ern-cicek.com.tr/anasayfa.html',
    viewport: { width: 1080, height: 1920 },  // Mobile portrait
    formFactor: 'narrow'
  },
  {
    name: 'home-wide.png', 
    url: 'https://ern-cicek.com.tr/anasayfa.html',
    viewport: { width: 1920, height: 1080 },  // Desktop
    formFactor: 'wide'
  }
];

const OUTPUT_DIR = path.join(__dirname, '..', 'images', 'screenshots');

async function generateScreenshots() {
  console.log('🚀 Starting PWA screenshot generation...\n');
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    for (const shot of SCREENSHOTS) {
      console.log(`📸 Capturing: ${shot.name} (${shot.viewport.width}x${shot.viewport.height})`);
      
      const page = await browser.newPage();
      await page.setViewport(shot.viewport);
      
      // Navigate and wait for network idle
      await page.goto(shot.url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      // Wait a bit for any animations to settle
      await new Promise(r => setTimeout(r, 1500));
      
      // Take screenshot
      const outputPath = path.join(OUTPUT_DIR, shot.name);
      await page.screenshot({ 
        path: outputPath,
        type: 'png',
        fullPage: false  // Just viewport, not full scroll
      });
      
      console.log(`   ✅ Saved: ${outputPath}`);
      await page.close();
    }
    
    console.log('\n✨ All screenshots generated successfully!');
    console.log('\nNext steps:');
    console.log('1. Review screenshots in images/screenshots/');
    console.log('2. Update manifest.json if needed');
    console.log('3. Commit and push changes');
    
  } finally {
    await browser.close();
  }
}

generateScreenshots().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
