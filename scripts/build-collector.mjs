// Bundles the MAIN-world collector into a single self-contained IIFE.
// This avoids dynamic-import path issues when injecting into a page's main
// world (relative imports there resolve against the page origin, not the
// extension). The output is dropped into public/ so CRXJS/Vite copies it to
// the dist root as a web-accessible resource.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

await build({
  entryPoints: [join(root, 'src', 'content', 'collector', 'main-world.ts')],
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  outfile: join(root, 'public', 'perflex-collector.js'),
  legalComments: 'none',
  minify: true,
  alias: {
    '@': join(root, 'src'),
  },
});

console.log('built public/perflex-collector.js');
