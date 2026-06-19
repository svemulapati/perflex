// Publishes the shared-session viewer for GitHub Pages.
// Single source of truth: public/viewer.html (also copied into the extension
// build by Vite). This mirrors it to docs/index.html so GitHub Pages can serve
// it at the site root — the destination permalinks point to.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'public', 'viewer.html');
const destDir = join(root, 'docs');
mkdirSync(destDir, { recursive: true });
copyFileSync(src, join(destDir, 'index.html'));
console.log('published docs/index.html (GitHub Pages viewer)');
