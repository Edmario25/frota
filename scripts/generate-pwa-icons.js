/**
 * Gera ícones PNG para PWA a partir do app-icon.svg
 * Necessário para iOS (não suporta SVG como ícone de PWA)
 */

const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const svgPath  = path.join(__dirname, '..', 'public', 'app-icon.svg');
const outDir   = path.join(__dirname, '..', 'public');

const icons = [
  { name: 'apple-touch-icon.png', size: 180 },  // iOS "Add to Home Screen"
  { name: 'pwa-192x192.png',      size: 192 },  // Manifest (pequeno)
  { name: 'pwa-512x512.png',      size: 512 },  // Manifest (splash / store)
];

(async () => {
  const svgBuffer = fs.readFileSync(svgPath);

  for (const { name, size } of icons) {
    const outPath = path.join(outDir, name);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outPath);
    console.log(`✓ ${name} (${size}×${size})`);
  }

  console.log('\nÍcones gerados em /public');
})();
