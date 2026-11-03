// Runs every browser check in sequence. Screenshots land in test/shots/.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const runs = [
  ['flows.mjs', 'drafting', 'light'],
  ['flows.mjs', 'studio', 'dark'],
  ['mobile.mjs', 'drafting', 'light'],
  ['mobile.mjs', 'studio', 'dark'],
  ['look.mjs'],
  ['edge.mjs'],
];
let failed = 0;
for (const [file, ...args] of runs) {
  console.log(`\n> ${file} ${args.join(' ')}`);
  const r = spawnSync(process.execPath, [path.join(dir, file), ...args], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
if (failed) {
  console.error(`\n${failed} browser check(s) failed`);
  process.exit(1);
}
console.log('\nAll browser checks passed');
