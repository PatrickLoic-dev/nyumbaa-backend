import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private connected = true;

  constructor(config: ConfigService) {
    this.client = new Redis(config.get<string>('redis.url') ?? 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    this.client.on('error', (err) => {
      if (this.connected) {
        this.logger.warn(`Redis error: ${err.message}`);
        this.connected = false;
      }
    });

    this.client.on('connect', () => {
      this.connected = true;
    });

    this.client.connect().catch(() => {
      // Graceful degradation — SQL fallback handles misses
    });
  }

  onModuleDestroy() {
    this.client.quit().catch(() => {});
  }

  async incr(key: string): Promise<number | null> {
    try { return await this.client.incr(key); } catch { return null; }
  }

  async decr(key: string): Promise<number | null> {
    try {
      const val = await this.client.decr(key);
      if (val < 0) { await this.client.set(key, 0); return 0; }
      return val;
    } catch { return null; }
  }

  async get(key: string): Promise<string | null> {
    try { return await this.client.get(key); } catch { return null; }
  }

  async set(key: string, value: string | number): Promise<void> {
    try { await this.client.set(String(key), String(value)); } catch {}
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    try { await this.client.setex(String(key), ttlSeconds, value); } catch {}
  }

  async del(key: string): Promise<void> {
    try { await this.client.del(key); } catch {}
  }

  async keys(pattern: string): Promise<string[]> {
    try { return await this.client.keys(pattern); } catch { return []; }
  }
}
