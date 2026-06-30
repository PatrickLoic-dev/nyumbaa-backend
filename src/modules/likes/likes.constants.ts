export const LIKES_NOTIFY_QUEUE = 'likes:notify';
export const LIKES_SYNC_QUEUE = 'likes:sync';
export const LIKES_REDIS_KEY = (postId: string) => `post:${postId}:likes_count`;
export const LIKES_NOTIFY_DELAY_MS = 5 * 60 * 1000; // 5 minutes consolidation window
export const LIKES_SYNC_CRON = '*/5 * * * *';
