import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { previewContent, corpusSql } from '../core/content';
import type { Question, SourceDocument } from '../core/types';
const mode = process.argv[2];
const corpus = JSON.parse(await readFile('data/corpus.json', 'utf8')) as {
  hash: string;
  version: string;
  documents: SourceDocument[];
};
const questions = JSON.parse(await readFile('data/questions.json', 'utf8')) as Question[];
await mkdir('.ragna', { recursive: true });
if (mode === 'preview') {
  if (!process.argv[3]) throw new Error('Kullanım: npm run content:preview -- belge.json');
  const raw = await readFile(process.argv[3], 'utf8');
  if (Buffer.byteLength(raw) > 105000) throw new Error('Belge çok büyük.');
  const parsed = JSON.parse(raw);
  if (parsed.baseHash && parsed.baseHash !== corpus.hash)
    throw new Error('Öneri eski corpus sürümüne ait; yeniden hazırlayın.');
  const result = previewContent(corpus.documents, parsed.candidate ?? parsed, questions);
  const proposal = {
    baseHash: corpus.hash,
    createdAt: new Date().toISOString(),
    candidate: result.candidate,
  };
  await writeFile('.ragna/proposal.json', JSON.stringify(proposal, null, 2) + '\n');
  await writeFile(
    '.ragna/preview.json',
    JSON.stringify({ ...result, documents: undefined }, null, 2) + '\n',
  );
  console.log(
    `Önizleme hazır: ${result.candidate.id} v${result.previousVersion} → v${result.candidate.version}; ${result.chunks.length} chunk; ${result.regressions.length} retrieval değişimi. .ragna/preview.json`,
  );
} else if (mode === 'apply') {
  const proposal = JSON.parse(await readFile('.ragna/proposal.json', 'utf8'));
  if (proposal.baseHash !== corpus.hash) throw new Error('Corpus değişmiş; yeni önizleme gerekli.');
  const result = previewContent(corpus.documents, proposal.candidate, questions);
  if (result.regressions.some((r) => r.before !== null && (r.after ?? 0) < r.before))
    throw new Error('Retrieval regresyonu var; öneriyi düzeltmeden uygulanamaz.');
  const nextHash = createHash('sha256')
    .update(JSON.stringify({ documents: result.documents, questions }))
    .digest('hex');
  const ids = (await readdir('migrations')).map((f) => Number(f.match(/^(\d+)_/)?.[1] || 0));
  const migration = `migrations/${String(Math.max(...ids) + 1).padStart(4, '0')}_content_${result.candidate.id}.sql`;
  await writeFile('.ragna/corpus-before.json', JSON.stringify(corpus, null, 2) + '\n');
  await writeFile(migration, corpusSql(result.documents), { flag: 'wx' });
  await writeFile(
    'data/corpus.json',
    JSON.stringify(
      {
        version: `${corpus.version}-${result.candidate.id}-v${result.candidate.version}`,
        hash: nextHash,
        documents: result.documents,
      },
      null,
      2,
    ) + '\n',
  );
  await writeFile(
    `data/sources/${result.candidate.id}.md`,
    `# ${result.candidate.title}\n\nSentetik · ${result.candidate.id} · v${result.candidate.version}\n\n` +
      result.candidate.sections.map((s) => `## ${s.heading}\n\n${s.text}`).join('\n\n') +
      '\n',
  );
  await writeFile(
    '.ragna/release.json',
    JSON.stringify(
      { baseHash: corpus.hash, corpusHash: nextHash, migration, status: 'yerelde-uygulandı' },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `Yerel değişiklikler hazır. ${migration}. Cache anahtarı değişti; eski kayıtlar artık eşleşmez. Yayımlamak için npm run content:publish.`,
  );
} else throw new Error('Beklenen komut: preview veya apply');
