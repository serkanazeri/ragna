import { readFile } from 'node:fs/promises';
export async function loadSecrets() {
  try {
    for (const line of (await readFile('.dev.vars', 'utf8')).split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
    }
  } catch {
    /* environment may be configured directly */
  }
}
