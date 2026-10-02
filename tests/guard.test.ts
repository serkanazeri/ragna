import { describe, it, expect, vi, afterEach } from 'vitest';
import { UsageGuard } from '../worker/guard';
import type { Env } from '../worker/env';
function setup(overrides: Record<string, string> = {}) {
  const data = new Map<string, unknown>();
  let queue = Promise.resolve();
  const storage = {
    get: async (k: string) => structuredClone(data.get(k)),
    put: async (k: string, v: unknown) => {
      data.set(k, structuredClone(v));
    },
    setAlarm: async () => {},
    deleteAll: async () => data.clear(),
    transaction: (fn: (s: unknown) => Promise<unknown>) => {
      const result = queue.then(() => fn(storage));
      queue = result.then(() => undefined);
      return result;
    },
  };
  const guard = new UsageGuard(
    { storage } as unknown as DurableObjectState,
    {
      DAILY_REQUEST_LIMIT: '100',
      DAILY_BUDGET_USD: '1',
      MAX_REQUEST_COST_USD: '.01',
      ...overrides,
    } as unknown as Env,
  );
  const reserve = (client = 'a', trusted = false) =>
    guard.fetch(
      new Request('https://guard/reserve', {
        method: 'POST',
        body: JSON.stringify({ client, trusted }),
      }),
    );
  return { guard, reserve };
}
afterEach(() => vi.useRealTimers());
describe('inference admission', () => {
  it('caps simultaneous public requests at six per minute', async () => {
    const { reserve } = setup();
    const responses = await Promise.all(Array.from({ length: 8 }, () => reserve()));
    expect(responses.filter((r) => r.ok)).toHaveLength(6);
    expect(responses.filter((r) => r.status === 429)).toHaveLength(2);
  });
  it('enforces a shared daily budget across different clients', async () => {
    const { reserve } = setup({ DAILY_BUDGET_USD: '.02' });
    expect((await reserve('a')).ok).toBe(true);
    expect((await reserve('b')).ok).toBe(true);
    expect((await reserve('c')).status).toBe(429);
  });
  it('enforces the global request limit for authenticated callers too', async () => {
    const { reserve } = setup({ DAILY_REQUEST_LIMIT: '1' });
    expect((await reserve('a', true)).ok).toBe(true);
    expect((await reserve('b', true)).status).toBe(429);
  });
  it('resets daily reservations on the next UTC day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
    const { reserve } = setup({ DAILY_REQUEST_LIMIT: '1' });
    await reserve();
    expect((await reserve()).status).toBe(429);
    vi.setSystemTime(new Date('2026-10-03T12:00:00Z'));
    expect((await reserve()).ok).toBe(true);
  });
});
