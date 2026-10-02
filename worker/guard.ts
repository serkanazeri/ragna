import type { Env } from './env';
export class UsageGuard {
  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      const daily = await this.state.storage.get<{ day: string; count: number; reserved: number }>(
        'day',
      );
      const current = daily?.day === new Date().toISOString().slice(0, 10);
      return Response.json({
        reservedUsd: current ? daily.reserved : 0,
        requests: current ? daily.count : 0,
        dailyLimitUsd: Number(this.env.DAILY_BUDGET_USD) || 1,
        dailyRequestLimit: Number(this.env.DAILY_REQUEST_LIMIT) || 100,
      });
    }
    const { client, trusted = false } = (await request.json()) as {
      client: string;
      trusted?: boolean;
    };
    const day = new Date().toISOString().slice(0, 10);
    const now = Date.now();
    return this.state.storage.transaction(async (storage) => {
      if (new URL(request.url).pathname === '/cache-access') {
        const key = 'cache-client:' + client;
        const prior = await storage.get<{ start: number; count: number }>(key);
        const minute = prior && now - prior.start < 60000 ? prior : { start: now, count: 0 };
        if (minute.count >= 60) return Response.json({ allowed: false }, { status: 429 });
        minute.count++;
        await storage.put(key, minute);
        await storage.setAlarm(now + 86400000);
        return Response.json({ allowed: true });
      }
      const previous = await storage.get<{ day: string; count: number; reserved: number }>('day');
      const daily = previous?.day === day ? previous : { day, count: 0, reserved: 0 };
      const key = 'client:' + client;
      const prior = await storage.get<{ start: number; count: number }>(key);
      const minute = prior && now - prior.start < 60_000 ? prior : { start: now, count: 0 };
      const requestLimit = Number(this.env.DAILY_REQUEST_LIMIT) || 100;
      const limit = Number(this.env.DAILY_BUDGET_USD) || 1;
      // Each call reserves a conservative ceiling; never trust the caller's price.
      const reservation = Math.max(0.01, Number(this.env.MAX_REQUEST_COST_USD) || 0.01);
      if (
        minute.count >= (trusted ? 30 : 6) ||
        daily.count >= requestLimit ||
        daily.reserved + reservation > limit + 1e-9
      )
        return Response.json(
          { allowed: false, reason: 'demo_quota', retryAfter: 60 },
          { status: 429 },
        );
      minute.count++;
      daily.count++;
      daily.reserved += reservation;
      await storage.put(key, minute);
      await storage.put('day', daily);
      await storage.setAlarm(now + 86_400_000);
      return Response.json({ allowed: true, reservedUsd: daily.reserved, dailyLimitUsd: limit });
    });
  }
  async alarm() {
    await this.state.storage.deleteAll();
  }
}
