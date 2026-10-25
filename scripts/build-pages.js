'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(projectRoot, 'public-site');

const rootFiles = [
  'CNAME',
  'robots.txt',
  'sitemap.xml',
  'index.html',
  'anasayfa.html',
  'bilgifisleri.html',
  'gizlilik.html',
  'iade-iptal.html',
  'kvkk.html',
  'odeme.html',
  'satis-sozlesmesi.html',
  'sepet.html',
  'siparis-detay.html',
  'siparisler.html',
  'urunler.html',
  'apple-touch-icon.png',
  'favicon.png',
  'logo.svg',
  'manifest.json',
  'products.json',
  'site-settings.json'
];

const publicDirectories = ['admin', 'images', 'lib', 'odeme'];
const forbiddenPaths = [
  '.env',
  'admin-config.json',
  'users',
  'orders',
  'carts',
  'invoices',
  'email-logs',
  'functions',
  'cloudflare-worker',
  'archive',
  'node_modules',
  'localhost.key',
  'localhost-san.key',
  'localhost.crt',
  'localhost-san.crt'
];
const publicExtensions = new Set([
  '.css', '.html', '.ico', '.jpeg', '.jpg', '.js', '.json', '.png',
  '.svg', '.txt', '.webm', '.webp', '.woff', '.woff2', '.xml'
]);

function copyPublicDirectory(relativeDirectory) {
  const sourceDirectory = path.join(projectRoot, relativeDirectory);
  const destinationDirectory = path.join(outputRoot, relativeDirectory);
  fs.mkdirSync(destinationDirectory, { recursive: true });

  for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;

    const relativePath = path.posix.join(relativeDirectory, entry.name);
    const sourcePath = path.join(projectRoot, relativePath);
    const destinationPath = path.join(outputRoot, relativePath);

    if (entry.isDirectory()) {
      copyPublicDirectory(relativePath);
      continue;
    }

    if (!entry.isFile() || !publicExtensions.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
  }
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

for (const file of rootFiles) {
  const sourcePath = path.join(projectRoot, file);
  if (!fs.existsSync(sourcePath)) {
    throw new Error('Public site file is missing: ' + file);
  }
  fs.copyFileSync(sourcePath, path.join(outputRoot, file));
}

for (const directory of publicDirectories) {
  copyPublicDirectory(directory);
}

for (const forbiddenPath of forbiddenPaths) {
  if (fs.existsSync(path.join(outputRoot, forbiddenPath))) {
    throw new Error('Sensitive or non-public path reached the Pages artifact: ' + forbiddenPath);
  }
}

console.log('Built allowlisted public site at ' + outputRoot);
