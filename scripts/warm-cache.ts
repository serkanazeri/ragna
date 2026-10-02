import { loadSecrets } from './env';
import type { ChatResponse } from '../core/types';
await loadSecrets();
const base = process.env.RAGNA_URL || 'http://127.0.0.1:8787';
if (!process.env.RAGNA_API_KEY) throw new Error('RAGNA_API_KEY gerekli.');
const examples = (await (await fetch(base + '/api/examples')).json()) as { question: string }[];
for (const { question } of examples) {
  const response = await fetch(base + '/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Ragna-Traffic': 'warmup',
      Authorization: `Bearer ${process.env.RAGNA_API_KEY}`,
    },
    body: JSON.stringify({ question }),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(`Cache hazırlığı başarısız: ${response.status}`);
  const result = (await response.json()) as ChatResponse;
  console.log(`${result.mode}: ${question}`);
}
