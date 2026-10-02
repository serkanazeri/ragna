import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const release = JSON.parse(await readFile('.ragna/release.json', 'utf8'));
const corpus = JSON.parse(await readFile('data/corpus.json', 'utf8'));
if (release.corpusHash !== corpus.hash)
  throw new Error('Yayımlama manifesti corpus ile eşleşmiyor.');
const config = JSON.parse(await readFile('wrangler.production.json', 'utf8'));
const run = async (command: string, args: string[]) => {
  const step = [command, ...args].join(' ');
  await writeFile(
    '.ragna/publish-status.json',
    JSON.stringify(
      { corpusHash: corpus.hash, step, status: 'running', updatedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
  try {
    execFileSync(command, args, {
      stdio: 'inherit',
      env: { ...process.env, RAGNA_URL: config.vars.SITE_URL },
    });
  } catch {
    await writeFile(
      '.ragna/publish-status.json',
      JSON.stringify(
        { corpusHash: corpus.hash, step, status: 'failed', updatedAt: new Date().toISOString() },
        null,
        2,
      ),
    );
    throw new Error(
      `Yayımlama ${step} adımında durdu; .ragna/publish-status.json kaydını inceleyin.`,
    );
  }
};
await run('npm', ['run', 'format:check']);
await run('npm', ['run', 'check']);
await run('npx', [
  'wrangler',
  'd1',
  'migrations',
  'apply',
  'ragna',
  '--remote',
  '--config',
  'wrangler.production.json',
]);
await run('npx', ['wrangler', 'deploy', '--config', 'wrangler.production.json']);
await run('npm', ['run', 'cloud:index']);
await run('npm', ['run', 'test:smoke']);
await run('npm', ['run', 'health:check']);
console.log('Belge yayımlandı; corpus index doğrulaması ve smoke kontrolü geçti.');

await writeFile(
  '.ragna/publish-status.json',
  JSON.stringify(
    { corpusHash: corpus.hash, status: 'complete', updatedAt: new Date().toISOString() },
    null,
    2,
  ),
);
