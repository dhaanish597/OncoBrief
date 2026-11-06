const fs = require('node:fs');
const path = require('node:path');
// Build-time only. sharp is also supplied by the workspace artifact runtime.
const sharp = require(process.env.ONCOBRIEF_SHARP_PATH || 'sharp');
const root = path.resolve(__dirname, '..');
sharp(fs.readFileSync(path.join(root, 'assets/icon.svg'))).png().toFile(path.join(root, 'assets/icon.png'));
