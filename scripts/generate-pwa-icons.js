const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const svgPath = path.join(__dirname, '..', 'images', 'logo.svg');
const iconsDir = path.join(__dirname, '..', 'images', 'icons');

// SVG'yi oku
const svgBuffer = fs.readFileSync(svgPath);

// Yeşil arka plan rengi - PWA için
const greenBg = { r: 45, g: 90, b: 39, alpha: 1 }; // #2d5a27

// Yuvarlak maske oluştur
function createRoundedMask(size, radius) {
  return Buffer.from(`
    <svg width="${size}" height="${size}">
      <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="white"/>
    </svg>
  `);
}

async function generateIcons() {
  console.log('PWA ikonları oluşturuluyor (oval kenarlar)...\n');
  
  for (const size of sizes) {
    const outputPath = path.join(iconsDir, `icon-${size}x${size}.png`);
    const radius = Math.round(size * 0.2); // %20 yuvarlak köşe
    
    // Önce kare ikon oluştur
    const squareIcon = await sharp(svgBuffer)
      .resize(size, size, {
        fit: 'contain',
        background: greenBg
      })
      .png()
      .toBuffer();
    
    // Yuvarlak maske uygula
    const mask = createRoundedMask(size, radius);
    
    await sharp(squareIcon)
      .composite([{
        input: await sharp(mask).resize(size, size).png().toBuffer(),
        blend: 'dest-in'
      }])
      .png()
      .toFile(outputPath);
    
    console.log(`✓ ${size}x${size} oluşturuldu (r=${radius})`);
  }
  
  // Apple touch icon (180x180) - iOS zaten yuvarlak yapıyor ama biz de yapalım
  const appleTouchPath = path.join(__dirname, '..', 'apple-touch-icon.png');
  const appleSize = 180;
  const appleRadius = Math.round(appleSize * 0.2);
  
  const appleSquare = await sharp(svgBuffer)
    .resize(appleSize, appleSize, {
      fit: 'contain',
      background: greenBg
    })
    .png()
    .toBuffer();
  
  const appleMask = createRoundedMask(appleSize, appleRadius);
  
  await sharp(appleSquare)
    .composite([{
      input: await sharp(appleMask).resize(appleSize, appleSize).png().toBuffer(),
      blend: 'dest-in'
    }])
    .png()
    .toFile(appleTouchPath);
  console.log('✓ apple-touch-icon.png oluşturuldu');
  
  // og-image (1200x630 - sosyal medya paylaşımı için) - bu dikdörtgen kalabilir
  const ogImagePath = path.join(__dirname, '..', 'images', 'og-image.png');
  await sharp(svgBuffer)
    .resize(800, 250, { fit: 'inside' })
    .extend({
      top: 190,
      bottom: 190,
      left: 200,
      right: 200,
      background: greenBg
    })
    .png()
    .toFile(ogImagePath);
  console.log('✓ og-image.png oluşturuldu');
  
  // Ana logo PNG
  const logoPngPath = path.join(__dirname, '..', 'images', 'logo.png');
  await sharp(svgBuffer)
    .resize(640, 200, { fit: 'inside' })
    .png()
    .toFile(logoPngPath);
  console.log('✓ logo.png oluşturuldu');
  
  console.log('\n✅ Tüm PWA ikonları başarıyla oluşturuldu!');
}

generateIcons().catch(err => {
  console.error('Hata:', err);
  process.exit(1);
});
