import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
const run = (args: string[]) =>
  execFileSync('npx', ['wrangler', ...args], {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'inherit'],
  });
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!account) throw new Error('Set CLOUDFLARE_ACCOUNT_ID to your Cloudflare account ID.');
const list = JSON.parse(run(['d1', 'list', '--json'])) as { name: string; uuid: string }[];
let db = list.find((d) => d.name === 'ragna');
if (!db) {
  console.log(run(['d1', 'create', 'ragna']));
  db = (JSON.parse(run(['d1', 'list', '--json'])) as typeof list).find((d) => d.name === 'ragna');
}
if (!db) throw new Error('Database creation did not return an ID.');
const vectorList = run(['vectorize', 'list']);
if (!/\bragna\b/.test(vectorList))
  console.log(run(['vectorize', 'create', 'ragna', '--dimensions=1024', '--metric=cosine']));
for (const property of ['audience', 'status']) {
  const indexes = run(['vectorize', 'list-metadata-index', 'ragna']);
  if (!indexes.includes(property))
    console.log(
      run([
        'vectorize',
        'create-metadata-index',
        'ragna',
        '--property-name',
        property,
        '--type',
        'string',
      ]),
    );
}
if (!run(['r2', 'bucket', 'list']).includes('ragna-sources'))
  console.log(run(['r2', 'bucket', 'create', 'ragna-sources']));
const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
config.account_id = account;
config.d1_databases[0].database_id = db.uuid;
config.ai = { binding: 'AI' };
config.vectorize = [{ binding: 'VECTORIZE', index_name: 'ragna' }];
config.r2_buckets = [{ binding: 'SOURCES', bucket_name: 'ragna-sources' }];
config.vars.ENVIRONMENT = 'production';
config.vars.SITE_URL = process.env.RAGNA_URL || 'https://ragna.serkanazeri.workers.dev';
await writeFile('wrangler.production.json', JSON.stringify(config, null, 2) + '\n');
console.log('Wrote wrangler.production.json. Apply migrations before deploying.');
