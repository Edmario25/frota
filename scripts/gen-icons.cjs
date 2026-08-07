const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const svgPath = path.join(__dirname, '..', 'public', 'app-icon.svg');
const outDir  = path.join(__dirname, '..', 'public');

const icons = [
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'pwa-192x192.png',      size: 192 },
  { name: 'pwa-512x512.png',      size: 512 },
];

(async () => {
  const svgBuffer = fs.readFileSync(svgPath);
  for (const { name, size } of icons) {
    await sharp(svgBuffer).resize(size, size).png().toFile(path.join(outDir, name));
    console.log('OK ' + name);
  }
})();
