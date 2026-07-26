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

  /** INCR key atomically. Returns new value, or null if Redis is unavailable. */
  async incr(key: string): Promise<number | null> {
    try {
      return await this.client.incr(key);
    } catch {
      return null;
    }
  }

  /** DECR key atomically. Floors at 0 to avoid negative counts. Returns new value or null. */
  async decr(key: string): Promise<number | null> {
    try {
      const val = await this.client.decr(key);
      if (val < 0) {
        await this.client.set(key, 0);
        return 0;
      }
      return val;
    } catch {
      return null;
    }
  }

  /** GET key. Returns null on miss or error. */
  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  /** SET key value. Fire-and-forget safe (error swallowed). */
  async set(key: string, value: string | number): Promise<void> {
    try {
      await this.client.set(String(key), String(value));
    } catch {
      // Redis unavailable — SQL is source of truth
    }
  }

  /** SETEX key ttlSeconds value — used for JWT cache. */
  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    try {
      await this.client.setex(String(key), ttlSeconds, value);
    } catch {}
  }

  /** DEL key. */
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch {}
  }

  /** Return all keys matching pattern (for sync job). */
  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch {
      return [];
    }
  }
}
