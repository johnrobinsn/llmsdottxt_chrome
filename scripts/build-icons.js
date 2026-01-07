import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'icons');

const sizes = [16, 32, 48, 128];
const variants = [
  { src: 'icon.svg', prefix: 'icon' },
  { src: 'icon-found.svg', prefix: 'icon-found' }
];

async function buildIcons() {
  for (const variant of variants) {
    const svgPath = join(iconsDir, variant.src);
    const svgBuffer = readFileSync(svgPath);

    for (const size of sizes) {
      const outputPath = join(iconsDir, `${variant.prefix}-${size}.png`);
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outputPath);
      console.log(`Created ${outputPath}`);
    }
  }
  console.log('Icon build complete!');
}

buildIcons().catch(console.error);
