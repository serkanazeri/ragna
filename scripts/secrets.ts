import { readFile, writeFile, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadSecrets } from './env';
let content = await readFile('.dev.vars', 'utf8').catch(() => '');
for (const name of ['RAGNA_API_KEY', 'WEBUI_SECRET_KEY']) {
  if (!new RegExp(`^${name}=.+`, 'm').test(content))
    content += `\n${name}=${Array.from(randomBytes(32))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')}\n`;
}
await writeFile('.dev.vars', content, { mode: 0o600 });
await chmod('.dev.vars', 0o600);
console.log('Local secrets initialized; existing values preserved.');
if (process.argv.includes('--deploy')) {
  await loadSecrets();
  for (const name of ['RAGNA_API_KEY', 'OPENROUTER_API_KEY', 'TURNSTILE_SECRET_KEY']) {
    const value = process.env[name];
    if (!value) continue;
    execFileSync(
      'npx',
      ['wrangler', 'secret', 'put', name, '--config', 'wrangler.production.json'],
      { input: value, stdio: ['pipe', 'inherit', 'inherit'] },
    );
  }
}
